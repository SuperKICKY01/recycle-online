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

**BEFORE BELIEVING ANY LINE HERE THAT SAYS SOMETHING IS ABSENT.** This file is
full of negative claims — not built, never done, no such thing — and **most have
never been checked against the repository.** Measured 2026-08-12, AFTER that
day's four corrections and the new verification entry landed, and BEFORE this
block was written, so none of these figures counts this block's own words:
**64 of this file's 109 entries carry a negative claim; 12 of those 64 have been
checked against source; 5 of the 12 were FALSE** — the thing they said was
missing was already built, and each was refuted by a single grep. **52 are
unchecked.** (Four of the five were corrected that day; the fifth already
carried its own correction.)

**52 IS A FLOOR, NOT A TOTAL, and the reason is not modesty.** The sweep that
produced it is known to be incomplete — it did not match the headlines of two of
the three entries already known to be stale, and caught them only through
unrelated lines inside them. A sweep that misses known cases will silently miss
unknown ones. The mechanism, and what widening it requires, is the last entry
under `OPEN_ITEMS.md § Documentation`.

**THE OPERATING RULE UNTIL THAT WORK IS DONE: every line here saying something is
absent, not built, or never done is a CLUE, and confirming it against the
repository is one grep.** A false negative in this file sends a session to build
what already exists; that cost a full day on 2026-08-12, and the diagnosis is at
`CLAUDE.md § Workflow` "A REPORT IS A CLUE".

---

## Blocking one real paying shop

- **A SHOP THAT DOES NOT USE GRADES CANNOT USE THIS SYSTEM — found by the
  P1.8a device pass, 2026-08-17, and it is the widest consequence that pass
  produced.** A seller with no grade PARKS every bill sold against them until
  somebody at the office sets one: `server/app/bills.py` refuses the post with
  a resolvable 424 `seller_grade_unset`, because the grade is what selects the
  `product_prices` tier. That is correct for a shop that grades. **For a shop
  that prices one product one way for everyone it is a block on EVERY
  WALK-IN** — and the walk-in is precisely the case P1.8a was built for, so
  the step that unblocked walk-ins re-blocks them for this shop shape.
  **THREE SHOP SHAPES EXIST AND ONE IS SERVED WELL:** grades that matter
  (served); no grades at all (an office round trip per walk-in); grades with a
  standard tier for walk-ins (an office round trip per walk-in). Today that
  round trip has NO SCREEN behind it on any surface — it was performed over
  HTTP by a developer in the pass that found this.
  *Not done:* nothing at all. It is a **PER-TENANT POLICY WITH NO HOME IN THE
  SCHEMA** — no column, no table, and no default to put one in.
  *Unblocks:* it is the first real consumer of the per-tenant settings
  foundation already queued under
  `OPEN_ITEMS.md § Schema requirements raised by the 2026-08-17 legal research round`,
  and that entry is cross-referenced rather than restated: it argues the
  foundation from STORAGE, and this is the feature that cannot be built
  without it.
  **WHY IT IS IN THIS SECTION AND NOT UNDER BUSINESS QUESTIONS:** it is not a
  question anyone must answer before work can start. The behaviour is measured
  and it stops a real shop shape from trading.
  **AMENDED 2026-08-18 — THE BLOCK CHANGED SHAPE, IT DID NOT CLEAR.** Everything
  above is left exactly as written and was true when written. `9ad225e` added
  `tenants.default_grade` and gave `POST /bills` a fallback to it, so the 424 is
  now raised only when the seller's grade AND the shop's default are both unset;
  setting either releases the same bill unchanged.
  **THE *Not done:* LINE ABOVE IS THE PART THAT TURNED.** "PER-TENANT POLICY WITH
  NO HOME IN THE SCHEMA — no column, no table, and no default to put one in" is
  FALSE for this one value as of that commit: there is a column, a named CHECK,
  and two routes. **What replaces it is not smaller, it is different — there is a
  home and no human can reach it.** `PATCH /shop` is admin-only and reachable by
  `curl` and by nothing else; no screen on any surface sets it; and
  `provision_shop.py` does not set it either, so every shop still starts at NULL.
  **OF THE THREE SHOP SHAPES NAMED ABOVE:** shape 1, grades that matter, is
  untouched and still served. Shapes 2 and 3 — no grades at all, and grades with a
  standard tier for walk-ins — now have a MECHANISM that would end the office
  round trip, and no way for the shop to switch it on. **So the round trip that
  "has NO SCREEN behind it on any surface" is still exactly that, and the sentence
  above stands as written for a different reason than when it was written.**
  The device wording caught up in `3e35558`: the parked card names both remedies
  rather than only the seller's grade, so the yard is at least told that the
  shop-wide fix exists. *Unblocks:* unchanged in kind — an operator surface,
  which `ROADMAP.md § P1.16` took as scope on the same date.
  **AMENDED 2026-08-28 — THE BLOCK WAS HIT LIVE ON A HANDSET, AND THE SHOP-DEFAULT
  FALLBACK RAN FOR THE FIRST TIME. A CONFIRMATION, NOT A NEW FINDING.** Everything
  above is left exactly as written and was true when written; the three consequences
  this records were already recorded in this entry and its 2026-08-18 amendment, so
  no queue line is added. What was owed was DATED EVIDENCE that the recorded block is
  real on a device rather than inferred from the 2026-08-17 pass. Every figure below
  is re-derived read-only from Postgres on the dev cluster (`recycle` on 5544),
  cross-tenant reads taken as the `postgres` superuser because every table here is
  FORCE ROW LEVEL SECURITY.
  **THE BLOCK WAS HIT LIVE.** A real purchase bill for cash paid on the yard —
  `B-2569-543`, total 40.00, one line of `AL-CAN`, against seller `S008` whose
  `grade` is NULL — was created on a handset at `device_created_at` 2026-08-28
  12:46:32Z and did not reach the server until `server_received_at` 13:02:52Z, about
  sixteen minutes later. It sat unsendable, parked on the 424 `seller_grade_unset`,
  until an admin set the shop default by `PATCH /shop` over curl — the office round
  trip this entry says "has NO SCREEN behind it on any surface", now confirmed on a
  device rather than inferred. (Re-derivation caught one advising-session reading
  that did not hold: seller `S008`'s name is not Thai but the ASCII placeholder
  `ggghh`, hex-verified `6767676868` — a test name typed on the yard.)
  **THE FALLBACK WORKS, AND THIS IS ITS FIRST RUN AGAINST A REAL PARKED BILL.**
  `tenants.default_grade` landed at `9ad225e` (2026-08-18) and until now nothing had
  exercised it. Setting Shop A's default to `B` released `B-2569-543` unchanged,
  whose seller's own `grade` is still NULL — the shop-wide fallback, read at bill
  time, is what priced it. It is the only bill in the cluster that both stands
  against a NULL-grade seller AND parked: the two other NULL-grade bills
  (`B-2569-383` and `B-2569-384`, seller `S005`) synced in about 8ms as direct
  inserts and predate the fallback. Mechanism confirmed; reachability unchanged — it
  still needs curl.
  **THE PARK IS CORRECT AND IS NOT THE DEFECT.** The bill waited about sixteen
  minutes and then sent itself with nothing retyped and no cash record lost — the
  behaviour the offline-first design intends (hard rule 8). The defect is only that
  the remedy needs curl, not that the bill parked.
  **THE OWN-PRICE CASE IS CONFIRMED AT THE COLUMN LEVEL, SHARPER THAN THIS ENTRY
  STATES IT.** The operator DID set the price — `unit_price` 20.00 — and the bill
  still could not go. `B-2569-543`'s line carries `list_price` 44.00, exactly the
  grade-B tier for `AL-CAN` (A 45.00 / B 44.00 / C 43.00 / D 42.00). Hard rule 6
  stores `list_price` beside `unit_price`, and `list_price` is selected by the grade
  tier — so a shop pricing one product one way for everyone is blocked not because it
  cannot set the price, but because the row cannot be completed without a grade. This
  is the mechanism behind the recorded consequence, not a new one.
  **EVERY OTHER TENANT IS STILL NULL.** Of the four tenants only Shop A now carries
  `default_grade` `B`; the other three — Shop B and the two tenants created
  2026-08-10 — are still NULL, because `provision_shop.py` sets no grade. The next
  shop provisioned hits this on its first walk-in bill.
  **WHAT THIS PASS DOES NOT ESTABLISH.** One handset, one tenant, the dev database, a
  debug build, one operator. Nothing about a release build, iOS, or a second device.
  The device-pass side of this — the seller reaching the server under its reserved
  code and the bill syncing — is recorded against P1.8b in
  `PROJECT_STATUS.md § Current phase`.

- **EIGHT THINGS EACH SHOP CONFIGURES FOR ITSELF, AND NOTHING STORES ANY OF
  THEM — recorded 2026-08-17.** ONE entry and not eight, because they share a
  single missing foundation and splitting them would hide that. They come from
  the owner's directive that every capability ships and each shop turns on what
  it wants — `ROADMAP.md § What the owner has settled` "S11 — every capability SHIPS"
  — which is a claim about STORAGE before it is a claim about features. In his
  order:
  (1) **the grade model** — how many tiers, what they are called, and whether
  tiers exist at all;
  (2) **the default grade for a new seller**;
  (3) **whether an id number is required**;
  (4) **whether a serial number is required, and for which product categories**;
  (5) **lump-sum purchase**;
  (6) **the PII retention period**;
  (7) **shop identity for the slip**;
  (8) **which photographs are required**.
  **THE SECOND OF THE EIGHT IS THE ONE THAT BLOCKS A WHOLE SHOP SHAPE TODAY**, and
  the mechanism is measured rather than argued: a seller created with no grade
  PARKS every bill sold against them until somebody at the office sets one. The
  shape it blocks is a shop that does not use grades at all, and the entry
  directly above this one holds the measurement, the three shop shapes and the
  424 that produces it — cross-referenced and deliberately not restated. A
  per-tenant DEFAULT is what turns that office round trip back into a walk-in
  sale, so item 2 is the first of the eight anything should be built for.
  **FIVE OF THE EIGHT ALREADY HAVE AN ENTRY AND ARE NOT DUPLICATED HERE.** Items
  4, 5, 6 and 7 are under
  `OPEN_ITEMS.md § Schema requirements raised by the 2026-08-17 legal research round`
  — as the serial-per-bill-line question, lump-sum, PDPA retention and shop
  identity — along with the per-tenant settings foundation itself, and that
  section carries the four limits on the round that raised them. Item 2's block is
  the entry directly above. **AND ITEM 4 ARRIVES HERE IN A DIFFERENT SHAPE:** that
  section frames it as a possible LEGAL DUTY on every line, and the owner frames
  it as a per-shop toggle scoped to product categories. Same column, two different
  reasons to have it, and only one of the two is unverified.
  **THREE ARE NEW HERE:** item 1's tier COUNT and tier NAMES (the entry above
  settles only whether a shop grades at all), item 3, and item 8 — which arrives
  with
  `ROADMAP.md § What the owner has settled` "S12 — photographs are part of the workflow".
  **WHAT THIS ENTRY ADDS that none of those has** is the COUNT and the fact that
  it is one list: eight per-tenant values, of which the schema holds zero.
  *Not done:* there is no settings table, no column and no default — and how the
  eight should be REPRESENTED is itself questioned, at
  `OPEN_ITEMS.md § Decisions open — the owner's, not the code's` (the settings-store
  finding). *Unblocks:* item 2 unblocks a shop shape that cannot trade;
  the rest unblock the handover.
  **WHY IT IS IN THIS SECTION.** Under
  `ROADMAP.md § What the owner has settled` "S7 — the pilot starts only after ALL THREE deliverables exist"
  the pilot bar and the sale bar are ONE bar, and S11 says every capability ships
  — so all eight are on the path to the first paying shop, which is what this
  section holds. It is not under *Business questions* because none of the eight
  needs an outside answer before work can start, and not under *Decisions open*
  because S11 already settled who decides: the shop does, per shop, at run time.
  **AMENDED 2026-08-18 — THE COUNT IN THIS ENTRY MOVED, WHICH IS THE ONE THING
  THIS ENTRY SAID IT WAS FOR.** Everything above is left exactly as written.
  `9ad225e` stores a grade default as `tenants.default_grade` with its own named
  CHECK — the form
  `ROADMAP.md § What the owner has settled` "S16 — THE EIGHT PER-TENANT VALUES ARE STORED BY KIND"
  requires, not a settings bag — so "eight per-tenant values, of which the schema
  holds zero" is now **one of eight, not zero**, and the *Not done:* line's "there
  is no settings table, no column and no default" is false for that one value.
  **AND THE MECHANISM IS NOT THE ONE ITEM 2 NAMES, which matters more than the
  count.** Item 2 above is *the default grade for a NEW SELLER* — a value written
  onto the seller row at creation. What landed is a SHOP-WIDE FALLBACK read at
  BILL time: a seller created today still has `grade` NULL, and the shop's default
  is consulted only when the bill is priced. The two produce the same relief for
  the blocked shop shape and are not the same thing, and whether item 2 as worded
  is ALSO wanted is not settled by this.
  **AND THE TWO ANSWER A LATER CHANGE TO THE VALUE DIFFERENTLY — recorded as a
  CONSEQUENCE, not as a decision.** A default STAMPED onto a seller at creation
  FREEZES that seller: changing the shop's default afterwards leaves every
  existing seller exactly where it was. A shop-wide fallback READ at bill time
  moves the price basis for EVERY NULL-grade seller at once, on every future
  bill. Neither is obviously correct — a shop repricing its walk-in tier may want
  precisely one of them and would be surprised by the other — and **the choice
  between them was made by the implementation without the question being put.**
  Nothing here authorises changing the mechanism. **The other seven are
  untouched.**
  The block itself is not cleared — the measurement, the three shop shapes, and
  what did and did not move are in the entry directly above this one,
  cross-referenced and deliberately not restated.
  **AMENDED 2026-08-30 — A NINTH THING, and the count this entry exists for moves
  again.** The owner added a per-shop STAFF MONEY-VISIBILITY toggle: whether staff
  see ANY money figure at all — the shop's takings and their own — is a per-shop
  setting the owner turns on. Its ONLY initial state is OFF; it has NO column
  today; and it is pulled by the DASHBOARD when that is built, not by this unit
  (schema is pulled by the feature that needs it — the owner's standing rule).
  RECORDED, NOT BUILT. So the set is NINE, its ninth member
  (9) **whether staff see a money figure**.
  The COUNT is superseded to NINE by this amendment: "EIGHT THINGS" in the heading
  and "eight per-tenant values" above are the designated count sites it moves.
  Left VERBATIM and deliberately: the enumeration (1)–(8), and the quoted heading
  `ROADMAP.md § What the owner has settled` "S16 — THE EIGHT PER-TENANT VALUES ARE STORED BY KIND"
  — S16's ROADMAP heading is NOT renamed, because a renumber orphans every citation
  that resolves on it (the section-name-collision hazard `lessons/README.md`
  records) and it is a settled decision this unit may not touch. The discrepancy —
  this entry now says NINE while S16's heading still says EIGHT — is recorded on
  purpose for whoever mints the per-tenant settings model. Separately, item 7 (shop
  identity) gained storage on 2026-08-30: `tenants.address` and `tenants.phone`
  landed at migration 0013, so of the nine the schema now holds TWO — item 1's
  `default_grade` and item 7's address/phone.
  **PULLED 2026-08-30 (P1.23 item 4 unit 2): item 9 IS NOW BUILT.** The staff-money-
  visibility toggle got its column — `tenants.staff_money_visible` (boolean NOT NULL
  DEFAULT false, migration 0014), pulled by the DASHBOARD under S17 exactly as this
  entry said it would be. Its tier is the precedent this section set: staff-readable
  `GET /shop`, admin-only `PATCH /shop`. `GET /reports/summary` refuses a staff caller
  its money while the toggle is OFF (403 `staff_money_hidden`), and when the owner
  turns it ON, a staff caller reads ONLY their own bills (`created_by = self`) — the
  ADVISOR'S READING of "when ON", built to and reported as such, the owner's to
  overrule.
  **DECIDED 2026-08-31 (P1.23 item 4 unit 3): "when ON" is NOW THE OWNER'S DECISION
  (E1), no longer the advisor's reading** — a staff principal sees ONLY their own
  figures (`created_by = self`) and shop-wide figures stay admin-only regardless of the
  toggle; the phone's dashboard is built to it.
  The COUNT is untouched — nine is still nine, and this mints no tenth — but
  of the nine the schema now holds THREE: item 1's `default_grade`, item 7's
  address/phone, and item 9's `staff_money_visible`, superseding the "holds TWO" above.
  **Superseded 2026-08-31 (P1.24, migration 0015): ITEM 1 IS NOW BUILT AS A TABLE, and
  the "holds THREE" line above mislabelled which store is item 1's.** Item 1 is the
  GRADE MODEL — "how many tiers, what they are called, and whether tiers exist at all"
  — and that is now the per-tenant TABLE `grade_tiers` (0015), which is exactly what
  item 1 asks for. `default_grade` (0010), which the line above attributed to item 1,
  is NOT item 1: it is the shop-wide fallback this entry's own 2026-08-18 amendment
  already reclassified ("the mechanism is not the one item 2 names ... a SHOP-WIDE
  FALLBACK read at BILL time"), item-2-adjacent, and it is unchanged. The COUNT stays
  NINE (no tenth minted). Re-derived, the schema now holds, of the nine, item 1
  (`grade_tiers`), item 7 (`address`/`phone`) and item 9 (`staff_money_visible`) — the
  same integer THREE, but now item 1 is represented by its own table rather than by a
  mislabelled fallback — PLUS `default_grade` as the item-2 fallback beside them. Item
  1's original *Not done:* line ("no column, no table, and no default to put one in")
  is now false in full: there is a table, with a composite FK from every graded row.
  What P1.24 has NOT yet built (S6-split: this is commit 1a): the ROUTES a shop uses to
  DECLARE its tiers, and the seller/price validation against a shop's OWN set — until
  1b lands, a grade a shop has not declared is refused by the FK, not by a message a
  person can read.
  **Superseded 2026-08-31 (commit 1b): those ROUTES are now BUILT.** `GET/POST/PATCH
  /grade-tiers` (staff read; admin write; no DELETE), the deactivation refusal naming its
  count (409 `grade_tier_in_use`), and grade validation against the shop's OWN tiers on the
  price / seller / default-grade routes — a code the shop has not declared is now a readable
  422 (`grade_not_a_tier`), not the FK's IntegrityError. F2 is built at seller-create: a
  one-tier shop's ungraded seller is SEATED in the sole tier. The ONLY P1.24 remainder is the
  PHONE (Phase 2); `bills.py`'s shop-wide `default_grade` fallback is untouched (that flagged
  fallback-vs-per-seller question is not reopened — 1b adds the per-seller SEATING for a
  one-tier shop and leaves the fallback for a multi-tier shop's ungraded sellers).
  **2026-08-31 (P1.21 phase 1) — WHAT ENABLING THE TOGGLE EXPOSES, and E1 does not make
  it obvious.** With `staff_money_visible` on, `GET /sellers/{seller_id}/history` returns
  the bill total and each line's `unit_price` for a staff caller on ALL of a seller's
  bills, not just their own — so a staff account can learn prices across the shop seller
  by seller, even though `GET /reports/summary` still restricts a staff caller to their
  OWN bills (E1). This is G2, the advisor's reading pending the owner's word (the reasoning
  is at ROADMAP § P1.21's dated note); the owner must weigh it BEFORE turning the toggle on.
  **THE TOGGLE HAS NO MOBILE CONTROL — re-derived 2026-08-31, `rg -n staff_money_visible
  mobile/`.** The phone READS the flag (`App.tsx` / `src/dashboard/dashboardView.ts`
  `readMoneyVisible`, off `GET /shop`, to gate the dashboard entry E2) but draws NO control
  to CHANGE it; `src/settings/shopSettings.ts` PATCHes only name / grade / address / phone.
  So the toggle is `PATCH /shop`-only today — an admin sets it server-side, and no phone UI
  does; a mobile control is a later line if the owner wants one on the phone.

- **~~NO STAFF ACCOUNT EXISTS AND THERE IS NO WAY TO CREATE ONE — measured
  2026-08-10, not inferred.~~ — THE SECOND HALF IS CLOSED, THE FIRST STANDS.**
  The measurement below is left exactly as taken: at `a73c264` the API declared
  **29 paths** and under `/users` there was only `GET /users` and
  `POST /users/{user_id}` `activate` / `deactivate` / `revoke-sessions`, with no
  create-user route and no password-change route, so an admin holding a valid
  token could not bring a staff account into being.
  **THERE IS NOW A WAY, as of `cb11f6a`**: `POST /users` (`0241cc8`),
  `POST /users/me/password` and `POST /users/{user_id}/password` — 31 declared
  paths and 37 operations, read out of the schema the app publishes. **What is
  still true is the FIRST half**: no staff account exists in any real shop, and
  the first admin of the pilot shop is still the only credential that shop has,
  because nothing has been created through those routes outside a scratch
  database.
  *Not done:* P1.5. Its text said an admin creates one account per staff member;
  that sentence is corrected in `ROADMAP.md` and its DONE WHEN is untouched.
  *Unblocks:* **the SHAPE is now decided; at `a73c264` not one line of it is
  built, and a parallel session had route 1 written but uncommitted in the
  working tree while this was being recorded** (`server/app/users.py:380`,
  `@router.post("/users")` behind `Depends(require_admin)` — written, not proven,
  not committed; routes 2 and 3 absent). Three
  endpoints, not two — an admin creates a user, an admin sets another user's
  password, and a user changes their own — recorded with the reasoning for the
  split at `ARCHITECTURE.md § 10. The three settled decisions` D6, together with
  D7 (an admin may create another admin), D8 (no forced change on first use) and
  D9 (minimum length, no composition rule). **~~What is outstanding is writing
  them, not deciding them.~~ — ALL THREE ARE WRITTEN AND PROVEN as of `cb11f6a`;
  what is outstanding is a handset and a production database, neither of which is
  code.** This entry read "a create-user endpoint under the admin
  gate, writing into `users` under the caller's own tenant context, plus a way to
  set a first password" until 2026-08-10: true as far as it went, and it named two
  things where there are three.
  **THE BOUND TRAVELS WITH THE FINDING**: the endpoint negative is authoritative
  because it comes from the schema the app publishes, but the companion survey of
  which writers reach `tenants` at all was run over RAW-SQL SPELLINGS, so its
  answer is **three sites FOUND, not three proven to be all** — an ORM call or a
  differently-spelled statement would not have matched it.

- **NOTHING HAS SIGNED IN FROM A HANDSET SINCE THE SHOP EXISTED.** The pilot shop
  on the dev database has an admin and a code, and no phone has ever presented
  either. P1.5's DONE WHEN wants a first admin AND a staff account both signing in
  from a handset; P1.3's Criterion A was satisfied over loopback HTTP by a proof,
  not by a device. *Not done:* no device pass has been run against the provisioned
  shop. *Unblocks:* nothing until there is an installable build and a reachable
  server, so this is bounded by R3 and R5 rather than by the accounts.
  **CORRECTED 2026-08-12 — THE HEADING IS NO LONGER TRUE AS WRITTEN, AND THIS
  ITEM DOES NOT CLOSE.** A handset has now presented a shop code and credentials:
  `local_shop` and `local_identity` each held their one row, the login screen was
  drawn after a real sign-out and a cold start, and `SecureStore.xml` went from
  count 1 while signed in to count 0 after. **The artefact is a TEST artefact** —
  this project's own Android DEBUG build (`9d2eb22`, `dev.chutipon.recycle`), one
  vivo 1938, never Expo Go, its API address a plain-HTTP LAN address baked in at
  build time. **What that does NOT establish:** nobody signed in through that
  screen to reach the cart screen and nothing was weighed, the product and seller
  lists being empty on that tenant; which tenant it was is not recorded in any
  tracked file, so whether the shop signed into was the PILOT shop is
  unestablished; iOS ran the secure store's clear on 2026-08-06 and has never run
  the migration; and no release build exists on either platform. P1.5's DONE WHEN
  wants a first admin and a staff account in PRODUCTION, which does not exist.

- **THE BELOW-LINE VOWEL CLASS IS UNTESTED BY THE ENCODING MEASUREMENT.** The
  2026-08-10 five-layer check used a name carrying above-line vowels (U+0E34,
  U+0E35) and a thanthakhat (U+0E4C) but **no U+0E38/U+0E39/U+0E3A**, so nothing
  is known about that class through those layers. It is very unlikely to differ —
  they are ordinary three-byte UTF-8 sequences in the same block — but "unlikely"
  is not "measured", and the whole value of that round was refusing to accept a
  rendering in place of bytes. *Not done:* no name exercising it has been sent
  through. *Unblocks:* one extra control name the next time anything is
  provisioned, at the cost of one more tenant row.

- **A SHOP CODE CAN NOW BE ISSUED — BY A SHELL SCRIPT, NOT BY THE RUNNING
  SYSTEM.** This entry read "**NOBODY CAN ISSUE A SHOP CODE**… it reads a relation
  that **nothing writes to by any route** — no endpoint, no script, no migration,
  no manual path. The relation is empty on the live database, so in production the
  endpoint returns 404 for every input… **This is the door with no key**" until
  2026-08-10. **Two of those clauses moved and one did not.** `8d395fc` committed
  `server/scripts/provision_shop.py`, which mints a code and INSERTs it as
  `recycle_owner`, and it was run against `recycle` that day: the pilot shop
  there holds `R6VD7RAC`, so the relation is no longer empty on the dev database.
  **NO ENDPOINT WRITES IT AND NO MIGRATION DOES**, which is the clause that has
  not moved — the running system still cannot give a shop a code, only an
  installer at a shell can. And `recycle` is the DEV database
  (`ARCHITECTURE.md § 10. The three settled decisions` D5), so **in PRODUCTION —
  which does not exist yet — the endpoint would still resolve nothing.**
  *Not done:* who issues a code when a shop is onboarded is undecided — whether
  the provider service mints it, whether it is generated at tenant creation, and
  what happens if a shop loses its slip are all open, and none is settled by the
  schema. *Unblocks:* P1.3's Criterion B, and nothing else does. Bound to P1.5.
  *Note the asymmetry a reader should not miss:* this read "Criterion A (the
  server is correct) is provable TODAY against a scratch database, and B is not
  provable at all until this exists — so 'P1.3 is not done' will mean two
  different things depending on which is outstanding" until 2026-08-10.
  **CRITERION A IS NOW SATISFIED (`b22d449`), so the ambiguity is gone and this
  item is the whole of what remains**: "P1.3 is not done" means B, and B means
  nobody can issue a code. It does not mean the server is wrong — the chain has
  been run end to end and the evidence is the dated entry in
  `PROJECT_STATUS.md`.
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
  **CORRECTED 2026-08-12 — "never attempted" is false; the item stands.** It was
  attempted and it worked: an Android DEBUG artefact built at `9d2eb22`,
  applicationId `dev.chutipon.recycle`, installed on one handset, a vivo 1938,
  and used to draw the login screen and to interrupt the migration. **It is a
  TEST artefact and cannot go to a shop** — no signing key was created, its
  launcher label says it is not real, and its API address is a plain-HTTP LAN
  address baked in at build time, so installed at a yard it would fail with no
  obvious cause. **NO RELEASE BUILD EXISTS on either platform, and no
  distribution route exists**, which is the whole of what this item asked for;
  nobody signed in through that build to reach the cart screen and nothing was
  weighed on it. So *Not done* now reads: **attempted, debug only, undistributed.**
- **Real per-shop accounts — `R5`** — the only credentials that exist
  are the dev fixture from the seed script. *Not done:* no
  account-provisioning path exists at all. *Unblocks:* deciding who
  creates a shop's first admin, and how.
  **CORRECTED 2026-08-10, AND THE TWO HALVES MOVED DIFFERENT DISTANCES.**
  The first sentence is false: `server/scripts/provision_shop.py` created the
  pilot shop's first admin on the dev database, so the seed fixture is no longer
  the only credential in existence. The *Unblocks:* is now half-answered — a
  shop's FIRST admin comes from an installer running that script at a shell, and
  who may create the SECOND is decided (an admin may create another admin,
  `ARCHITECTURE.md § 10. The three settled decisions` D7). What is still open is
  neither of those: it is that no endpoint exists for any of it, which is the
  first entry in this section and not this one. **This entry is kept rather than
  deleted** because `R5` is cited from elsewhere and because a reader arriving at
  "no account-provisioning path exists at all" should meet the correction beside
  it, not instead of it.
  **CORRECTED AGAIN 2026-08-12, AND IT IS THE CORRECTION ABOVE THAT WENT STALE,
  not the original.** That block ends "it is that no endpoint exists for any of
  it" — false since `cb11f6a`, the same day it was written. **In source, read
  this pass:** `server/app/users.py:390` is `@router.post("/users")`, `:805` is
  `@router.post("/users/me/password")` and `:901` is
  `@router.post("/users/{user_id}/password")` — the three routes D6 specifies.
  Found by `git log -S "users/me/password"` over that file rather than by reading
  commit subjects.
  **WORTH NAMING BECAUSE IT IS THE SHAPE THIS FILE KEEPS PRODUCING: a dated
  correction is not permanently true either.** This one was outlived by a commit
  on its own date. What is still outstanding is the ORIGINAL bar and nothing
  smaller — accounts in a production database that does not exist. *Not done:*
  unchanged. *Unblocks:* unchanged.
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
  **CORRECTED 2026-08-12 — "`purchase_bills` has no `created_by` column" IS
  FALSE, and the open question it framed has been answered.** **In source, read
  this pass:** migration `0006` line 159 is
  `ALTER TABLE purchase_bills ADD COLUMN created_by uuid`, and
  `server/app/bills.py:541` names `created_by` in the INSERT's column list, so
  the API writes it. Built by `9673171`, found by
  `git log -S "ADD COLUMN created_by"` over the migrations rather than by
  reading commit subjects. The divergence this entry called "the actual open
  question" was decided rather than left: the column records **the session that
  SUBMITTED the bill**, which `0006`'s own docstring states in its first lines
  and distinguishes from whoever weighed the load.
  **WHAT REMAINS TRUE IS THE PART THAT CANNOT BE REPAIRED**, and it is why this
  entry is not simply closed: every bill written before `0006` is authorless
  permanently, and the entry counting ten of them sits under
  `OPEN_ITEMS.md § Code debt found and left in place` — named by section only,
  because a citation whose target is its own file counts its own line and cannot
  resolve. **A SECOND SITE CARRIES THE SAME
  FALSE SENTENCE AND IS NOT CORRECTED HERE:**
  `ARCHITECTURE.md § 11. A known absence, stated as true rather than as a gap`
  opens with it, and correcting another file's section is not this entry's to do
  — it is named so the next pass does not have to rediscover it. *Not done:* the
  ARCHITECTURE correction. *Unblocks:* nothing.
- **A half-finished cart surviving a change of USER — `R5`'s question,
  not `R1b`'s** — sign-out deliberately LEAVES the open draft in SQLite
  (`local_draft`), and R1b proves it is still there afterwards rather
  than assuming it. That is right today: a draft is one un-promoted
  weighing, nothing is money until `promoteToBill` runs, and clearing it
  would be the single place sign-out destroys work. *Not done:* the
  question only becomes real when a DIFFERENT person can sign in, and
  today they cannot — `signIn()` uses the hardcoded DEMO credentials in
  `mobile/app/config.ts`, so signing out and back in returns the same
  account.
  **CORRECTED 2026-08-12 — "today they cannot" is false at `4bde6e1`, and the
  question this item deferred is now live.** `app/config.ts` holds no tenant, no
  username and no password; a person signs in on `app/LoginScreen.tsx` with
  their own credentials, against a shop code the SERVER resolves, so a DIFFERENT
  person can sign in and signing out and back in no longer returns the same
  account. **Part of it is already answered:** `fde2b0c` made the draft loader
  hand back only the current person's cart — withheld, kept, not adopted, not
  destroyed, with a count on the start screen. **What is still open** is what
  SHOULD become of that withheld cart, which is the decision this item exists
  for. **Not observed on a device:** a shift change was never staged. The one
  Android pass ran on this project's own DEBUG build (`9d2eb22`,
  `dev.chutipon.recycle`, one vivo 1938) — **a TEST artefact** with a plain-HTTP
  LAN address baked in at build time — and it drew the login screen and cleared
  a session, but nobody reached the cart screen through it and nothing was
  weighed. iOS has never drawn that screen; no release build exists.
  *Unblocks:* `R5` (real per-shop accounts) deciding whether a
  cart left open by the departing shift should be offered to the next
  one, discarded, or shown with its author named — which is also the
  point at which "who wrote this" becomes answerable at all (see the
  `created_by` item above).
- **Scheduled and off-site backup — `R3`, same step as the server** —
  the dump/restore scripts exist and the round trip is proven, but
  **nothing schedules them** and the copies sit on the same box. *Not
  done:* out of scope of the phase that built the scripts. *Unblocks:*
  somewhere off-site to put them, and a scheduler; then retention and
  encryption at rest become real questions rather than deferred ones.
  **Not separable from the hosting step:** the moment the server holds
  one real bill, an unscheduled backup is a single copy.

- **THE BACKUP TOOLING CANNOT REACH A REMOTE DATABASE AT ALL, AND THIS IS
  UNBUILT WORK NOBODY HAS COUNTED — `R3`/P1.2. Measured 2026-08-12 at
  `94ad325`.** Both scripts reach Postgres by shelling into a CONTAINER, never
  over the network: `backup_db.py:116` and `restore_db.py:56` name a container,
  `backup_db.py:148` and `restore_db.py:75` are the `docker exec` wrappers every
  statement goes through, and `backup_db.py:615` / `restore_db.py:318` move
  files with `docker cp`. `restore_db.py:105` states it outright — it "does not
  use a database driver at all: it shells out to `psql -c` through docker exec".
  **There is no DSN path in either script**, and `BACKUP.md` records the scope
  that made that reasonable: the local docker-compose Postgres is "the only
  deployment that exists — there is no cloud host to back up yet".
  *Why it isn't done:* nothing was wrong with it. It was correct for the only
  deployment there has ever been, and the assumption is invisible until the
  database moves.
  **WHY THIS IS SIZED RATHER THAN NOTED, and it is the whole reason for this
  entry.** The day the database moves to a host, the backup tooling **stops
  working** — and a backup is HALF of that step's own acceptance criterion
  (`ROADMAP.md § P1.2 — A server a shop can reach` wants a scheduled dump fetched off-box and restored into
  a scratch database). So this surfaces at the moment the step looks nearly
  done: the server is reachable, the phone gets its 200, and the other half of
  the criterion cannot be attempted at all. **A step that is half-met and looks
  finished is worse than one that has not started.**
  *What the work actually is, so it can be counted rather than discovered:* a
  connection path that is not `docker exec` for every `psql`, `pg_dump` and
  `pg_dumpall` invocation in both scripts, plus a replacement for `docker cp`,
  which moves the dump files off the machine and has no network equivalent in
  the current design. The row-count and role-attribute verification either
  survives that change or the backup stops being verified — and
  `lessons/README.md § Lessons` "a-backup-is-a-claim-until-it-is-restored.md"
  is the reason it must survive.
  *Unblocks:* nothing else waits on it, which is exactly why it will be reached
  last. It is bounded by the hosting choice only in that the choice decides what
  the new path must speak.
- **A day view on the desktop — `R7`, after a shop is running** — the
  daily money screen exists on the phone only, so an owner who works
  from a PC cannot see the day's takings there. *Not done:* `desktop/`
  is empty. *Unblocks:* same decision as the master-data screens.
- **EVERY PRICE CHANGE MADE BEFORE PRICE HISTORY EXISTS IS ALREADY
  UNRECOVERABLE, AND THE CLOCK IS RUNNING NOW — raised 2026-08-20 by the
  step that needs it.** `PUT /products/{product_id}/prices/{grade}` ends
  `ON CONFLICT (tenant_id, product_id, grade) DO UPDATE SET price =
  EXCLUDED.price`, so a tier's previous value is overwritten in place;
  `product_prices` is `(id, tenant_id, product_id, grade, price)` with no
  timestamp and no actor, and reading the migration stack FORWARD from
  `0001` to `0011` with every DROP applied finds **no history or audit
  relation of any kind in this schema**. That is a read of the stack and
  NOT a query of the head state, which was out of bounds for the phase
  that measured it. *Why it is here rather than only at the step:*
  **this one is not rework, it is data that does not come back.** A
  feature built late is built late; a history built late begins at the
  day it is built, and every change before that is gone with no copy
  anywhere. **What is NOT lost, so this is not read as wider than it
  is:** hard rule 6 keeps `unit_price` and `list_price` on every bill
  line, so what a SOLD line was struck at is preserved for ever. What is
  absent is the LIST's own history — what a tier stood at on a day
  nobody traded it, when it moved, and who moved it. *Not done:*
  reported, not fixed; no migration is written and none is proposed
  here. *Unblocks:* the step that owns it, `ROADMAP.md § STAGE 1`
  "Price history", which records the same measurement as a schema
  dependency rather than assuming the data exists.

## Verification gaps — built, not proven

- **THE GRADE ROUTES' EXTERNAL-SERVER PROOFS HAVE NOT BEEN RUN AGAINST THE TIER MODEL
  — recorded 2026-08-31 (P1.24 commit 1b).** `prove_master_write`,
  `prove_master_data_gate`, `prove_seller_pricing`, `prove_master` and
  `prove_daily_report` exercise the grade routes (`PUT /products/{id}/prices/{grade}`,
  `POST /sellers` grade) against dev through a live API on `:8099`/`:8000`, and NONE was
  run this phase — each writes bills/master into dev (debris), and their grade coverage
  is duplicated by the four route proofs that WERE run green twice (`prove_grade_tiers`,
  `prove_seller_create`, `prove_seller_code_guards`, `prove_shop_settings`): valid A-D
  grades pass on Shop A's active tiers, and `PUT prices/Z → 422 grade_not_a_tier` is the
  same refusal those cover. A green not run today is not written as green. THE FIRST
  PHASE THAT STANDS UP A LIVE API FOR ANOTHER REASON SHOULD RUN THEM against the tier
  model.
- **THE PHONE'S DASHBOARD (P1.23 item 4 unit 3) IS HEADLESS-PROVEN, THE HANDSET HALF
  IS UNOBSERVED.** `prove:dashboard` (49 cells) and the real-HTTP client run against a
  fresh uvicorn cover the builders and the request/parse path, but NO screen was drawn
  on a device this session. The owner's device pass — the admin dashboard on today with
  bars, the per-bill list and the ค้างส่งจากเครื่องนี้ line; เดือนนี้ as aggregates only;
  a staff session with the toggle off having no entry, then `ยอดของฉัน` once the owner
  turns it on — is spelled out verbatim in `PROJECT_STATUS.md § Current phase`, the
  unit-3 record's device-pass paragraph. Unit 1's settings/account device pass is ALSO
  still UNOBSERVED (same section). *Not done:* a device pass; owed to the owner.
- **`proveSignOut`'s store-backed S3 can TRANSIENTLY fire its hard-stop under heavy
  contention — observed ONCE, 2026-08-30, and NOT a regression.** S3 exercises a
  FAILING keystore through an async fake over a SQLite temp DB. Run in isolation it
  is green (measured 3/3) and it is green TWICE in the full-suite sweep; but a
  single run issued IMMEDIATELY after the whole suite showed its guard
  "S3 CANNOT CONTINUE: signOut() did not report a failure" fire (exit 1). No module
  `proveSignOut` depends on was touched by P1.23 item 4, so this is a pre-existing
  timing sensitivity, not a change. The existing footgun — "re-run once before
  believing any failure" — is exactly what distinguishes this from a real red, and
  is what was done (three isolated re-runs, all green). Recorded so a future sweep
  does not misread the transient as a regression. *Not done:* the async fixture's
  behaviour under load is not hardened; a discovery, not a fix owed by this phase.
- **`prove_seller_code_guards.py` IS NO LONGER A BARE RE-RUN, AND A PROOF THAT
  CANNOT RUN BARE IS A PROOF THAT GETS SKIPPED. Measured 2026-08-25 at the P1.8b
  MOBILE boundary; a MEASUREMENT and not a fix.** The script requires a git
  worktree at the P1.8b server phase's FIRST commit, passed as `--old-tree`,
  because its whole method is differential: it drives the same staging against
  the pre-guard server and the post-guard one and reads which answers MOVED.
  **That worktree was REMOVED on instruction**, so the script's default
  invocation no longer has the thing it compares against.
  **IT IS REPRODUCIBLE AND THAT IS NOT THE SAME AS RUNNABLE.** The proof's own
  docstring carries the command that recreates the worktree, so nothing is lost
  and no evidence has decayed — what changed is the COST of the first run, from
  one command to two, one of which nobody will think to issue. Every other proof
  in this repository is `uv run python scripts/prove_<name>.py` and this one is
  not, so a session sweeping the suite runs the others and skips this one
  without noticing that it did.
  **WHY IT IS RECORDED HERE RATHER THAN REPAIRED.** Whether the proof should
  BUILD ITS OWN WORKTREE is a change to a differential checker, and a checker
  that creates the object it measures against is a different instrument with its
  own failure modes — `a-checker-must-not-share-the-code-it-checks` is the
  argument that has to be made before it, not after. That is a later decision
  and this entry does not take it.
  **THE HALF THAT IS NOT A GAP, said so the entry is not read as one:** the
  guards themselves are proven. `b8b557f` landed them with the differential run
  green at the time; what is unavailable today is the cheap RE-run, not the
  original observation.
  **CLOSED IN M4 c2b — 2026-08-29 (`083d777`).** It is a BARE
  RE-RUN again: `uv run python scripts/prove_seller_code_guards.py` with no
  arguments self-restores a scratch (`recycle_guards_scratch`, from a live dump —
  live read-only) and self-builds a detached worktree at `b8b557f^` (the pinned
  commit before the guards) in a temp path, fails LOUD if the path exists, and
  removes the worktree in a `finally`. The `a-checker-must-not-share-the-code-it-checks`
  argument this entry required BEFORE the change, now made and confirmed: the
  worktree is pinned to a FIXED historical sha, never derived from the current
  code, and the existing discriminator — the ADMITTED halves go red if `--old-tree`
  is really the new code — catches a wrong tree; empirically the ADMITTED cells are
  GREEN, so the built tree genuinely lacks the guard. Green TWICE bare (49 checks,
  failures 0 both), `git worktree list` ONE entry before AND after both runs (no
  leak); `--database`/`--old-tree` remain as optional overrides.

- **TWO THINGS THE P1.8a DEVICE PASS DID NOT OBSERVE, 2026-08-17 — and both
  are about the SAME card, which is why they are one entry rather than two.**
  The bill landed and the row is in `recycle`; what is missing is what a
  person saw.
  **(a) THE AUTOMATIC SEND IS UNVERIFIED.** The parked card promises
  `เมื่อสำนักงานแก้ให้แล้ว ระบบจะส่งเองอัตโนมัติ` — that the system will send
  the bill itself once the office fixes the data. What was actually observed
  is that it sends WHEN PRESSED: the owner was instructed to press
  `ส่งอีกครั้ง`, so the engine's own retry interval was never allowed to be
  the thing that fired. **A wait is a promise about the future exactly as much
  as a button is**, and this one has never been kept in anyone's sight.
  **(b) THE UNPARK RENDERING HAS NEVER BEEN QUOTED BY ANYONE.** The PARKED
  state was captured before the press; the state after it was not. The row
  proves the bill landed and says nothing about what the card said as it
  changed — and a card still reading `รอสำนักงาน…` over a bill that now
  carries a doc_no is exactly the shape this project keeps finding.
  *Done when:* ONE staging closes both — park a bill on a grade-less seller,
  set the grade from the office, **press nothing**, and quote the card before
  and after.

- **NOTHING NOTICES A FIFTH `master_data_missing` CODE. The client mapping is
  complete at `e836073` and nothing keeps it complete — recorded 2026-08-13,
  the mechanism chosen by the owner over a server-side census.** The seam:
  `server/app/bills.py` emits one code per `_master_data_missing(` call site
  (four at `e836073`), and `mobile/src/sync/parkedReason.ts` must list every
  one in `MASTER_DATA_CODES` or a parked bill degrades to the cause-neutral
  fallback — safe wording since `e836073`, but the office is no longer told
  the actual fix, and only `proveSeller` S7's per-code cells would notice,
  which cover only codes already in the list. That drift has happened once:
  the two retirement codes shipped server-side and the list stayed at two,
  which was the audit's band-A finding.
  **THE MECHANISM TO BUILD, in the manner of `tools/verify_citations.ps1` —
  a checker that reads BOTH SIDES:** (1) the emitted set: the first string
  argument of every `_master_data_missing(` call, found by grepping for the
  HELPER'S NAME repo-wide under `server/`, never a hardcoded file list — the
  citation checker's first hole was a hardcoded source that let 37 citations
  go unchecked; (2) the mapped set: the string literals of the
  `MASTER_DATA_CODES` array in `parkedReason.ts`; (3) RED on any set
  difference in EITHER direction (an unmapped server code is the band-A
  shape again; a client code the server never emits is dead wording), and
  print BOTH counts, neither of which may be zero — a parser that quietly
  matches nothing is indistinguishable from a pass
  (`CLAUDE.md § Machine footguns` "give any parser that can quietly stop").
  *Not done:* the checker does not exist and nothing runs it. *Unblocks:*
  writing it (Python, per the `.ps1`-source footgun), and the owner deciding
  where it runs — beside the citation checker in the doc pass, or as a cell
  a proof executes.

- **NOTHING PROVES WHAT TWO SIMULTANEOUS PASSWORD WRITES DO. Recorded 2026-08-10,
  and it is a GAP IN THE PROOF rather than a known defect.** `cb11f6a`'s proof
  drives both password routes sequentially, in one process, one request at a
  time. Three interleavings are untested: two self-changes at once; an admin
  reset racing the same user's self-change; and a self-change racing that user's
  `revoke-sessions`. The self route reads the stored hash and writes in ONE
  transaction, which is why this is a gap rather than an accusation — the read
  and the write cannot be separated by another transaction's commit under
  Postgres' default isolation, and both writers bump the same counter, so the
  plausible outcome is that one write wins and both sessions die.
  **THAT IS AN ARGUMENT, AND AN ARGUMENT IS NOT A MEASUREMENT** —
  `lessons/README.md § Lessons` "concurrency-tests-need-a-barrier.md" is explicit
  that without a start barrier and printed overlap evidence, the workers ran
  sequentially and a green result proves nothing, so this cannot be closed by
  adding two calls and observing that neither broke. *Not done:* no proof drives
  them concurrently. *Unblocks:* a barrier-based cell in
  `prove_user_create.py`, which is cheap; what makes it worth doing is that the
  losing write here is a CREDENTIAL a person was told to use.

- **The sync strip says the phone is OFFLINE while the server is
  refusing its token — observed on a device, and NOT diagnosed.
  `R2b` in `ROADMAP.md`** — its own step, inserted after R2; R3 onward
  keep the numbers they already had. **The diagnosis is being done in a
  separate read-only session and is not finished, so no cause is accepted
  and none is written below.**
  Device pass 2026-08-06, real iPhone, Shop A admin account, `R1b`
  build (sign-out written, not yet committed); each step observed
  before the next. Airplane mode on, one bill weighed and saved
  (88.00, one line), sitting in the send queue as `รอส่ง` with no
  doc_no. From the PC, `POST /users/35d09981-…/revoke-sessions`
  returned 200 and `users.token_version` for that user moved 1 → 2,
  read back out of Postgres. Airplane mode off, Wi-Fi at full strength
  for the rest of the pass. Over the next ~3 minutes the queued bill
  cycled `รอส่ง` → `กำลังส่ง` → `รอส่ง` and never sent. The sync strip
  read, verbatim:
  `ออฟไลน์ — เก็บไว้ในเครื่อง 1 ใบ จะส่งให้เองเมื่อเน็ตกลับมา`
  Sign-out was refused with a dialog reading, verbatim:
  `ยังออกจากระบบไม่ได้ / มีบิลรอส่งขึ้นระบบ 1 ใบ / รอให้ส่งครบก่อน แล้วจึงออกจากระบบได้`
  **The daily money screen, opened in the same minute, classified the
  SAME refusal correctly:** a `ต้องเข้าสู่ระบบใหม่` card, no money field
  anywhere on it, and a sign-in button that resolved the session when
  tapped. Read out of the uvicorn log, not off the screen:
  `GET /products`, `GET /sellers`, `POST /bills` and
  `GET /reports/daily` all returned 401, then `POST /auth/login` 200
  and the queued bill posted 201.
  **Why it matters:** two renderers of one app drew one cause two ways
  in one minute, and the sync-strip wording is FALSE while it is on
  screen — the network was up. The sign-out dialog names a condition
  that never arrives if the token cannot be renewed, which in the
  revocation case it cannot. **Revocation is not required to reach
  this:** it is what every device draws when `JWT_TTL_SECONDS` expires
  mid-shift. This is `lessons/unavailable-is-not-rejected.md` and
  `lessons/401-is-about-the-caller-not-the-bill.md` landing together in
  shape **(c)** of `BRIEFING.md` §5 — a correct backend is not a
  correct product until the screen agrees. *Not done:* **the cause has
  not been diagnosed, and this entry deliberately does not name one.**
  Two candidates with different fixes: the sync engine may classify 401
  as `unavailable` on this path, or it may classify per record
  correctly while `queueHealth` reads "records pending + nothing
  sending" as an offline backlog. Nobody has read `engine.ts` or
  `queueHealth.ts` for this. Found during the `R1b` device pass and
  deliberately NOT fixed inside it — a fix without a diagnosis is what
  `lessons/diagnosis-must-precede-the-fix.md` exists for, and an entry
  naming a cause nobody measured is worse than one that says the cause
  is unknown. *Unblocks:* reading those two files against this
  reproduction, which is cheap to stage — revoke a session, or just let
  a token expire while a bill is queued.
- **~~`prove_reconcile.py` is RED, and has been since the 2026-08-03
  rebuild~~ — CLOSED 2026-08-07 by `ROADMAP.md § STAGE 1`
  "prove_reconcile.py back to green".** It exits 0 twice bare against a
  scratch copy with no reseed between. **The record is the dated entry in
  `PROJECT_STATUS.md`'s Baseline observations (2026-08-07, P1.10) and is
  deliberately NOT restated here:** two copies drift, and a new session
  believes whichever it reads first. **One thing the entry below got wrong
  travels with the closure**, because it is the finding rather than a
  detail: the four failing cells were **two different defects, not one**.
  Three were the stale counts described below; the fourth, `:716`, holds no
  count at all and was red because the X3 probe had stopped landing its row
  inside the window it measures. Deriving the three — which is what this
  entry, `ROADMAP.md` and `PROJECT_STATUS.md` all prescribed — would have
  left that cell red. The text below is left standing as the record of what
  was believed at the time. *(The "3 tenants, `T0` got 3" figure in it does
  not fit the 2N−1 relation the other measurements do, which predicts 5. Noted
  during P1.10, not chased.)*
  **Three of its expectations
  are absolute counts of a database that no longer exists:
  `prove_reconcile.py:634` `{"T0": 91}`, `:636`
  `rows_visible_with_no_tenant_context=46`, and `:718`
  `rows_at_start=46  rows_at_end=47`. They were written against the
  pre-rebuild 46-tenant database; the rebuild took it to 2 tenants, and
  nothing has run the script since it was last green on 2026-08-02.
  **Measured, not inferred:** it fails from a pre-0005 dump (48 tenants,
  `T0` got 95), from a different pre-0005 dump (3 tenants, `T0` got 3),
  and identically from a POST-0005 dump — the same four failures either
  side of the migration, so the new column is not involved. Every
  injection that is about MONEY still passes; only the two tenant-count
  assertions and the X3 timing probe fail. *Not done:* found while
  running the proof set for R1a, and fixing it means deciding what those
  numbers should be derived FROM — a change to a destructive proof, which
  is not a thing to do in passing. *Unblocks:* deriving the expected
  counts from the restored copy at runtime instead of hardcoding them.
  **This is `lessons/proof-must-run-twice.md` biting for the fifth time,
  in the very file its fourth amendment was written about** — a count
  assertion over data that can change has a half-life, and this one
  expired the day the database was rebuilt.
- **ON A ONE-TENANT DATABASE, THREE OF `prove_reconcile.py`'s INJECTIONS DO NOT
  RUN — AND A PILOT SHOP'S DATABASE HAS ONE TENANT.** Found in P1.10 and
  MEASURED on a copy reduced to one tenant on purpose, not reasoned:
  **S3/T0** cannot fire (with one tenant, exactly one row is visible whether RLS
  on `tenants` is on or off, so T0 has nothing to report), **S3/X2** cannot fire
  (the per-tenant sweep's total and the global total are the same number), and
  **T10** cannot fire (there is no other shop's seller to point a bill at).
  **Those three are the injections that exercise TENANT ISOLATION**, which is the
  most heavily enforced property in the system
  (`ARCHITECTURE.md § 8.2 Tenant isolation, in full`). They now SKIP with the
  reason printed and the count carried into the summary — which is the correct
  outcome and is NOT the same as covering them. *Not done, and it may be
  unfixable rather than undone:* these injections need two tenants because the
  property they break is a relation BETWEEN tenants, and manufacturing a second
  tenant inside a shop's own database to test it would put a row in a paying
  shop's ledger that the product could not have produced
  (`lessons/a-proof-fixture-must-be-a-row-the-product-could-produce.md`).
  **The consequence to carry, and the thing to actually read:** at a pilot shop
  this proof's exit 0 means LESS than the same exit 0 means on this box, and the
  number that says how much less is the **skip count**, not the exit code.
  `ROADMAP.md § STAGE 2` "A standing reconcile against the shop's real data"
  rests on this proof; it rests on a narrower green there. *Unblocks:* a decision
  on whether a two-tenant scratch copy restored from the shop's dump is the thing
  P2.2 points the proof at — which would keep the coverage and keep the
  fabricated tenant out of the shop's own database. Nobody has taken it.
- **A 400 ms unconditional `refresh()` runs on a screen that has signed
  out** — `App.tsx:560-569` re-reads the local bill store every 400 ms
  while `ready`, with no gate on the session at all, so it keeps running
  after a sign-out. *Harmless today,* and that is the whole of why it is
  a recorded line rather than a fix: everything `refresh()` currently
  reads is SHOP data that legitimately survives a change of operator —
  bill counts, the bill list, queue health, the last sync time. **What
  is not guaranteed is that it stays that way.** Nothing prevents a
  session-derived value being added to `refresh()` later, at which point
  a signed-out screen starts re-populating it every 400 ms and
  `CLEARED_SESSION` cannot hold. *Not done:* not `R1b`'s to fix, and
  gating it is not free either — see the note on `lastSyncedAt` and
  `health` in `src/session/signOut.ts`, which become load-bearing the
  moment this ticker IS gated. *Unblocks:* deciding what `refresh()` is
  for — shop data only, in which case say so and keep it ungated, or
  session-aware, in which case it needs the gate and the two values
  above stop being redundant on the same day.
- **`App.tsx` holds its session as ten independent `useState` atoms, so
  no proof can see one being ADDED** — `R1b` put the list of
  session-derived values in `src/session/signOut.ts` (`ClearedSession`)
  and made `App.tsx` apply it through a mapped setter type, so a value
  added to THE LIST is a compile error until the app supplies a setter.
  The opposite direction is still open: a new `useState` added to
  `App.tsx` and never added to the list is invisible to the compiler and
  to `proveSignOut` alike, and the cost is the departed user's role,
  permission refusal or takings left on screen under the next user's
  session. *Not done:* closing it means `App.tsx` holding ONE session
  state value instead of ten — measured at **45 setter sites and ~88
  read sites**, plus a change to React's re-render granularity, which is
  not a refactor to run inside a security phase on an app whose only
  verification is a device pass. *Unblocks:* a deliberate state refactor,
  best done when something else already requires touching those call
  sites. Until then the limit is labelled in `proveSignOut.ts` S2 rather
  than implied.
- **Android coverage** — one pass, one borrowed handset, one OS version.
  The void flow, the offline behaviours, draft recovery, the stale-cache
  price gate and background sync have never run there. *Not done:* no
  Android device on hand. *Unblocks:* a handset.
  **CORRECTED 2026-08-12 — the count is two and "no Android device on hand" is
  false; NOT ONE of the five named behaviours moved.** The second pass ran on
  this project's own Android DEBUG build (`9d2eb22`, `dev.chutipon.recycle`), a
  vivo 1938, never Expo Go — **a TEST artefact**, its API address a plain-HTTP
  LAN address baked in at build time. **It observed** the login screen drawn
  after a real sign-out and a cold start, a session established and cleared at
  the secure store and at a new process, and the migration force-stopped twice
  mid-transaction with the old shape intact. **It did not weigh anything and
  nobody reached the cart screen through it** — the product and seller lists were
  empty on that tenant — so the void flow, the offline behaviours, draft
  recovery, the price gate and background sync are untouched and this item stays
  open on every one of them. iOS has never run the migration; no release build
  exists on either platform. *Unblocks:* unchanged — a pass that exercises those
  five.
- **The on-device SQLite crash window** — the multi-statement path
  (write the bill and clear the draft, indivisibly) is proven under
  Node's SQLite with a real kill, but the Expo driver's transaction
  path genuinely differs and has no headless proof. *Not done:* the
  driver cannot run outside a device. *Unblocks:* a scripted device
  test that kills the process mid-transaction, or accepting the risk in
  writing.
- **The 20-second request timeout — STAGED 2026-08-06, and STILL OPEN on
  what the staging could not establish.** A hung socket — one that
  completes the TCP accept and then never answers — was put in front of
  the daily money screen for the first time, which is the case the
  timeout exists for and which the old offline test (network killed,
  throws immediately) never reached. **ESTABLISHED:** it ends in the
  no-number outage screen — badge, retry button, no money field — rather
  than rendering the day as `0.00`. **NOT ESTABLISHED:** that it ended at
  the 20 s ceiling specifically rather than at some other transport
  failure. The duration was WATCHED on an operator's stopwatch, not
  measured, and a REFUSED connection draws the same screen, so the
  observation cannot separate the two. The staged socket is not uvicorn,
  so the log holds no line for it; that absence is expected and is
  evidence of nothing. Record: `PROJECT_STATUS.md` Baseline observations,
  2026-08-06 device pass, R2 item 2 — not restated here. *Not done:*
  nothing has yet timed the wait against the constant, so the entry is
  neither closed nor untouched — the failure mode is proven safe, the
  ceiling is not proven to be the thing that produced it. *Unblocks:* a
  staging that MEASURES the elapsed time — a hung endpoint plus a clock,
  or an instrumented `AbortController` — which is what would turn "a hung
  socket fails safely" into a statement about the 20 s value itself.
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
  **AMENDED 2026-08-09, AND NOT CLOSED — the sentence above is now true of
  ONE THIRD of S4 and false of the rest, which is the whole finding.** When
  it was written S4 was one thing: a read of `rolsuper`/`rolbypassrls`. It
  now has THREE clauses — the role SET exists, the ATTRIBUTES, and the
  rolconfig SETTINGS — and they do not share a fate. **The attribute clause
  is still unproven by execution and for exactly the reason above**, which
  has not weakened: granting SUPERUSER or BYPASSRLS is cluster-wide and the
  live money database shares this cluster. **The other two are now proven**,
  and by an instrument the original sentence did not consider: changing what
  the CHECKER DECLARES rather than what the cluster IS. That reaches no role,
  no database and no cluster, so the argument that blocked the attribute
  clause never applied to it. Measured 2026-08-09 — declare a `search_path`
  on a role that has none and S4 goes red naming it while the correctly
  configured role stays green in the same run; declare a role that does not
  exist and the missing-role arm fires while `examined` moves 3 of 3 to 3 of
  4; and deleting either arm removes exactly its own red and leaves the
  other's standing. *Still not done:* the attribute clause. *Unblocks:* the
  same genuinely separate cluster, and nothing else. **The label was right
  and has become too broad — do not read it as covering S4 entire, and do
  not delete it either.**
- **The sign-out guard on an IN-FLIGHT send sits where no proof can
  reach it.** `mobile/App.tsx:611` re-checks
  `maySync({ paused: syncPausedRef.current, token: tokenRef.current })`
  AFTER `await engine.runOnce()` (line 581), so a sign-out landing
  mid-pass cannot write session state onto a screen that already says
  signed out. The guard is correct and its boundary — what is dropped
  (session claims) versus kept (everything already written to SQLite) —
  is argued at `App.tsx:583-610`. **What is unproven is its PLACEMENT,
  not its logic.** `maySync` itself
  (`mobile/src/session/signOut.ts:79`) is asserted as a predicate by
  `proveSignOut` S4b, but that `App.tsx` calls it a SECOND time, after
  the await, is asserted nowhere: **delete line 611 and `prove:signout`
  stays green AND `npm run typecheck:app` still exits 0** — removing a
  call is valid TypeScript, and `maySync` stays used at line 579 so no
  unused-import error fires either. *Not done:* `App.tsx` is outside the
  node proof program entirely (`tsconfig.node.json` sets
  `rootDir: "src"`), so no proof can see that line; closing it means
  moving the decision down into `src/` where a proof can drive the
  ordering. *Unblocks:* a proof that owns the ORDER of a sync pass rather
  than only the predicate it consults — which would also cover any future
  guard added to `syncOnce`.
- **The sync pass's session DECISION moved into `src/`; the two lines that
  APPLY it did not, and cannot.** Direct sibling of the item above, same
  structural cause, and recorded separately because what remains is a
  different kind of thing. `sessionEndedAfterPass`
  (`mobile/src/session/signOut.ts`) now owns the whole mapping from a
  `SyncRunResult` to `sessionEnded` — which before this lived nowhere but
  `App.tsx:617`, confirmed by grep across the tree — and `proveSignOut` S9
  drives it from a real 401 pass and a real outage pass against a real
  `SqliteLocalStore`. Break its `sessionExpired` arm and seven cells go
  red, the paired control among them, while BOTH typecheck programs stay
  at exit 0. **What is still unobservable is the CALL.**
  `mobile/App.tsx:617` and `:658` each read
  `setSessionEnded((was) => sessionEndedAfterPass(was, r))`; delete either
  line and `prove:signout` stays green and `npm run typecheck:app` still
  exits 0, for the reason given one item above — `tsconfig.node.json` sets
  `rootDir: "src"` and no node proof can compile that file. **What DID
  change, and it is not nothing:** the residue is now WIRING rather than a
  decision. `App.tsx` writes no `true` and no `false` for `sessionEnded`
  anywhere in `syncOnce`. The two `if` conditions still standing there —
  `r.sessionExpired > 0`, and the accept/reject/park test — now serve
  `online` and the early returns, so if either ever drifts from the
  predicate **the session value stays CORRECT and only `online` is
  wrong.** That is a smaller blast radius, not a closed item. *Not done:*
  nothing closes it short of an instrument that is not a node proof. A
  source scan over `App.tsx` was proposed and REFUSED by the owner, on the
  ground that a check asserting TEXT rather than behaviour would be a
  fifth instance of the shape
  `lessons/a-check-that-never-went-red-was-never-observed.md` catalogues —
  added to verify the fix for the fourth. *Unblocks:* the same thing the
  item above needs, and one proof would cover both: something that owns
  the ORDER and the WIRING of a sync pass, not only the predicates it
  consults.
- **TWO NEW PROOF SCRIPTS CAN WRITE TO A DATABASE THEY WERE NOT POINTED
  AT — FOUND 2026-08-08 by the first red-team pass, CONFIRMED by reading.
  SEQUENCE: FIRST of three, and it is first by DEPENDENCY, not by
  severity.** `prove_clock_guard.py:225-229` spawns
  `reset_clock_watermark.py` with `--reason` and
  `--yes-the-clock-is-verified-correct` and **no `--database`**, while
  `reset_clock_watermark.py:52-53` offers exactly that flag and `:61`
  otherwise falls back to the inherited `MIGRATION_DATABASE_URL`, which
  `app.config`'s `load_dotenv()` points at dev. `PROVE_DB` — the knob the
  docstring discusses — reaches only the `sql()` helper and never the
  subprocess. Separately, `prove_year_gate.py:43` takes `PROVE_DB` as a
  DEFAULT, never required and never compared to the live URL, and
  `clear_bills()` at `:105-106` issues `DELETE FROM purchase_bill_items`
  and `DELETE FROM purchase_bills`. Both docstrings say scratch-only; a
  docstring is not a guard, and `lessons/README.md` line 43 records the
  last time one was the only protection here.
  **WHY FIRST:** the entry below cannot be verified by RUNNING anything,
  because running it trips this. Two guards committed on 2026-08-08
  cannot be exercised without risking dev, which makes this the blocker
  rather than the largest item.
  **The standard already exists in this repository and was not applied:**
  `prove_docno_clock.py:109-128` requires `--database`, compares it
  against `APP_DATABASE_URL`, refuses with exit 2 and the restore command
  printed, and rebinds the URL so the code under test cannot escape.
  *Done when:* each script REFUSES when pointed at the live database,
  printing the restore command, and RUNS when pointed at a scratch one —
  both directions observed, or neither counts — and `--database` reaches
  the C6 subprocess.
  *Known residual this does NOT close:* both scripts drive an EXTERNAL
  API through `API_BASE_URL`, and that process is bound to its database
  at startup, so rebinding a URL inside the script cannot reach it. A
  script correctly pointed at scratch while the API runs against dev
  still writes bills to dev through the real path. Candidate closure: a
  read-only cross-check comparing a bill count taken through psql on
  `--database` against one taken through the API, refusing when they
  disagree. Not designed here.
  **CORRECTION 2026-08-08, and `5010375`'s COMMIT MESSAGE IS WRONG about
  this — a future reader who finds it should not trust that sentence.**
  It says the URL is "rebound so anything reading it in THIS process
  cannot escape". It is not. `server/app/db.py:24` runs
  `create_async_engine(APP_DATABASE_URL, ...)` at IMPORT, from the value
  `app.config` read at import, so by the time `main()` rebinds
  `os.environ`, the engine already exists and still points wherever
  `.env` said. **The protective value of this change is the REFUSAL,
  which is proven in both directions; the rebinding is not what makes it
  safe.** No harm today — neither script uses `app.db`'s engine, they use
  psql through the container and httpx against the API — but the same
  question applies to `prove_docno_clock.py:127`, whose rebinding was the
  model copied here and which may be equally inert. Not checked, and not
  this entry's to fix. History is permanent: the commit stands and this
  supersedes it.
  *Honest debt, left deliberately:* the refusal is now DUPLICATED in three
  scripts — `prove_docno_clock.py`, `prove_clock_guard.py`,
  `prove_year_gate.py` — and three copies of one convention are free to
  drift. Extracting a shared helper means editing `prove_docno_clock.py`,
  which is working code nobody asked to have touched, so it is recorded
  rather than done. That is the obvious follow-up whenever a fourth
  script needs the same guard.
- **`should_refuse()`'s TWO FAIL-CLOSED CLAUSES ARE COVERED BY NOTHING —
  FOUND 2026-08-08, CONFIRMED by reading. SEQUENCE: SECOND of three,
  and it cannot start until the entry above is done.**
  `clock_guard.py:80` is `return self.tripped or not self.has_evaluated
  or self.consecutive_failures > 0`. **`prove_clock_guard.py` contains
  ZERO occurrences of `has_evaluated` or `consecutive_failures`**; the
  only occurrence in either new suite is `prove_year_gate.py:203`, which
  asserts `has_evaluated is True` — the healthy side. No cell can reach
  the state those two clauses guard, so reducing the method to
  `return self.tripped` cannot redden anything in either file.
  **What makes it sharp rather than tidy:** `clock_guard.py:59-62`
  records the incident the clauses were written for — a guard that had
  never once read the clock answering `/health` with `{"status":"ok"}`,
  observed the same day. A clause written that morning in response to an
  observed defect has no cell. That is
  `lessons/a-check-that-never-went-red-was-never-observed.md` mechanism 2
  — the failing state unreachable from the inputs supplied — arriving in
  code approved hours earlier.
  *Done when:* one cell drives `has_evaluated == False` and one drives
  `consecutive_failures > 0`, each asserting a REFUSAL; and each clause
  is deleted IN TURN with the corresponding cells observed going RED and
  their neighbours staying green. Deleting a clause and seeing nothing
  move is the current state, and is not a pass.
  **PARTLY CLOSED 2026-08-08: `consecutive_failures > 0` now has cells;
  `not has_evaluated` still does not — see the entry below.**
  `prove_clock_guard.py` C7 produces the failure rather than simulating
  it: renaming `server_clock_watermark` away makes `evaluate()`'s SELECT
  raise, which is the same except-branch an unreadable database takes.
  Nine cells, including a CONTROL that a healthy guard has zero
  consecutive failures — without it, mutating `should_refuse()` to
  `return True` would satisfy every other cell.
  Disproof, measured as a DELTA against a baseline run in identical
  conditions rather than as an absolute: production code 33 PASS / 0
  FAIL; clause deleted 30 PASS / 3 FAIL; red only under the mutation and
  red in both, 3 and 0. The three are "a failed read REFUSES" (got 200),
  "status names the STALE cause" (got ok), and "business endpoint
  refuses on a failed read" (status=201 — the mutated guard ACCEPTED a
  bill while its clock read was failing). The other six C7 cells stay
  green under it correctly: they assert state transitions in
  `evaluate()`, which the mutation does not touch.
  *A first attempt at this reported 17 red and could not account for
  eleven of them.* The cause was the mutation harness, not the product:
  it left its health-wait on the API's first RESPONSE rather than on the
  guard having evaluated, so the proof began against a guard with a null
  instant and the run cascaded. That attempt measured two things at once
  and is superseded by the delta above, which pre-checks the table name
  and waits for `checked_at`. Recorded because a disproof arriving
  inside a run nobody can account for is not a disproof.
- **`should_refuse()`'s `not has_evaluated` CLAUSE CANNOT BE COVERED
  WITHOUT A DECISION THIS PROJECT HAS NEVER MADE — NAMED 2026-08-08, and
  deliberately left open.** It is the clause that refuses when the guard
  has NEVER successfully read the clock. Three routes, all closed:
  **(1)** `has_evaluated` is MONOTONIC — `clock_guard.py:156` sets it
  True and nothing sets it back — so it cannot be driven on a live
  process, which is why C7 covers the stale clause and not this one.
  **(2)** In-process is closed by `server/app/db.py:24`, which builds the
  engine at IMPORT from `.env`; calling `evaluate()` from a proof would
  read DEV's table, and forcing its failure would mean renaming dev's
  table. **(3)** What remains is for the proof to SPAWN ITS OWN uvicorn
  against a scratch database whose watermark table is already renamed
  away, assert 503 with `clock_guard_never_evaluated`, then rename back
  and stop it.
  **(3) is a design decision and it is the owner's, not a session's.** It
  makes a proof own a server process — a new failure surface (ports,
  startup races, orphaned processes, a kill that does not land) inside
  the artifact whose whole job is to be trustworthy. This repository has
  never done it, and a session adopting it quietly at the end of a phase
  is how a convention gets made by accident.
  **What leaving it costs, stated rather than implied:** the clause that
  fires when a guard has never evaluated is the clause that would have
  caught the defect observed on the morning of 2026-08-08 —
  `clock_guard.py:59-62` records it, a guard that had never once read the
  clock answering `/health` with `{"status":"ok"}`. **That exact clause
  is the one still with no cell.** The finding was "a clause written in
  response to an observed defect has no cell"; one level in, the half
  that remains uncovered is the half that names the defect.
  *Not done:* nothing, and nothing should be until the decision is made.
  *Unblocks:* the owner ruling on whether a proof in this repository may
  start and stop a server process. If yes, (3) is perhaps thirty lines.
  If no, the clause stays uncovered and that is a knowing choice rather
  than an oversight — which is the difference this entry exists to make.
- **A FIXTURE ASSERTS AS CORRECT A BEHAVIOUR OUR OWN COMMITS MADE WRONG
  SEVEN HOURS EARLIER, AND IT WILL STAY GREEN — FOUND 2026-08-08. This is
  a CLASS, not an instance.** `mobile/src/proof/fakes.ts:645-651` returns
  a 503 as `{kind: "unavailable", reachable: true}` and comments it as
  intended: "That is the poison shape: the network is fine, the reachable
  server keeps erroring on this one payload. It is what the UI must
  escalate to a red alarm." That was true when written. The clock guard
  committed the same morning made 503 a condition true of EVERY bill,
  which is the one thing `engine.ts:620-634` says must never feed the
  per-bill alarm. **The cell is not wrong about what the code does — it
  is wrong about what the code should do, and nothing in a test run can
  tell those apart.** It will pass every time until someone changes the
  classification it encodes.
  **Why this is a class.** A fixture states a PREMISE about the world the
  product lives in. When the product moves under it, the cell does not go
  red — it reports agreement with a world that no longer exists, and its
  green is indistinguishable from a green that means something. Related
  to `lessons/a-check-that-never-went-red-was-never-observed.md` and
  inverted from it: those nine mechanisms are cells that CANNOT go red;
  this is a cell that WOULD go red if the premise it encodes were
  updated, and stays green precisely because nobody updated it.
  **Superseded 2026-08-17: ELEVEN mechanisms, not nine.** The tenth
  landed at `2f88403` and the eleventh in this phase, and this sentence
  was stale for both. The ARGUMENT above is untouched and still holds —
  it is about the inversion, not about the count. **And the eleventh
  narrows the word "those": it is the only mechanism in that file about
  a RED rather than a green, so "cells that CANNOT go red" is now true
  of ten of the eleven.** The count is quoted here at all only because
  this entry quotes it; the file itself states it in exactly one place
  by design, and that place is the authority.
  **THE OPEN QUESTION THIS RAISES, and it is deliberately unanswered:
  how many other cells in either proof suite encode a premise the clock
  work changed?** Two commits added a server-wide 503 and a tenant-wide
  409 to paths that previously had neither. Any fixture, fake or
  assertion written before them may be asserting the older world.
  *Not done:* nobody has looked, and nobody should start before the size
  of the question is known. *What would answer it:* an inventory — every
  fixture and fake in `mobile/src/proof/` and `server/scripts/` that
  encodes an assumption about what a status code MEANS rather than about
  what a function returns, checked against the statuses the clock work
  introduced. The count matters more than the fixes: a handful is a
  sweep, and dozens is a statement about how this project writes
  fixtures. *Unblocks:* knowing whether the answer is a sweep or a
  practice change.
- **`CLOCK_GUARD_TICK_SECONDS` HAS TWO DIFFERENT DEFAULTS, AND NOTHING ON
  EITHER SIDE CHECKS THEY AGREE — FOUND 2026-08-08 while verifying the
  entry above.** `server/app/clock_guard.py:48` reads it with a default of
  **"60"**; `server/scripts/prove_clock_guard.py:119` reads the SAME
  variable with a default of **"2"**, and `wait_ticks()` sleeps in
  multiples of its own value. Unless the variable is exported to BOTH
  processes, the proof waits 30x less than the API takes to tick.
  **It failed in the expensive direction.** Run without it, nine cells go
  red — C2 (the watermark "did not advance") and all of C3 (`/health`
  "returned 200 while tripped"), which reads exactly like the guard being
  broken. It is not: the server log showed `CLOCK GUARD TRIPPED ... 503`
  at the correct moment, and the proof had simply already looked. A
  proof-harness timing artifact wearing a product defect's clothes, and
  the only thing that separated them was reading the server's own log
  instead of the proof's verdict. With the variable set to 2 on both
  sides, 24/24 cells pass twice consecutively.
  **Two knobs that must agree, with nothing checking that they do** — the
  same shape as the three-target hazard in the entry above, and the third
  time today that a green or a red turned on an environment fact no
  assertion covered.
  *Not done:* deliberately unfixed in this phase. *Done when:* the proof
  REFUSES to run unless it can establish the API's actual tick interval
  rather than assuming one — reading it from a value the API reports, or
  requiring the variable explicitly and failing closed when it is unset.
  Making the two defaults equal is NOT a fix: it removes today's symptom
  and leaves the next shell that sets one and not the other in exactly
  this position.
- **`reconcile.py`'s five structural checks cannot see a relation outside
  schema `public`, and the limit is the PREDICATE, not the exclusion
  lists.** Migration 0009 (committed, and **APPLIED TO THE LIVE DATABASE
  `recycle` ON 2026-08-09** — this read "NOT YET APPLIED to any cluster" until
  then) creates `directory.shop_codes`, the first relation in this database
  outside `public`. **That changes this item's status from unprovable to
  provable:** the relation the widened predicate must enumerate now exists on
  the live database, so a green from a widened check is no longer green over an
  empty set. Still open; nothing about the predicate has changed. Seven sites
  bound every structural check to that schema:
  `server/scripts/reconcile.py:809` (the shared `present` query, which
  feeds S1's `examined` and ALL of S2's detection), `:818` (S1's own
  query), `:851`, `:855`, `:857` (S3), `:903` (S5 constraints, from
  `pg_constraint`) and `:905` (S5 indexes, from `pg_indexes`). **A
  relation in another schema is never ENUMERATED, so it can never be
  reported as unknown**, and the obvious-looking fix is a no-op: adding
  `'shop_codes'` to the `NOT IN` list at `:823-824` or to S2's list at
  `:838-839` would read as coverage while changing no result, because
  those lists remove names that were already enumerated. The consequence
  is not about this one relation: from 0009 onward a tenant-scoped table
  with no RLS can be added to schema `directory` and S1, S2, S3 and S5
  all stay green, including S2, whose entire stated job is to notice a
  table the checker has never heard of. *Not done:* 0009 deliberately
  changes no checker; 0008 updated S1, S2 and `CANNOT_SEE` in the same
  change that created its exception, and 0009 does not, which is the
  gap. *Unblocks:* widening the seven predicates to a named set of
  schemas AND schema-qualifying the comparison keys — `present` (`:809`)
  selects bare `c.relname`, and `ALL_RLS_TABLES` (`:290-294`),
  `REQUIRED_CONSTRAINTS` (`:299-317`) and `REQUIRED_INDEXES`
  (`:318-323`) are all bare-name-keyed, so admitting a second schema
  without qualifying them makes two same-named relations
  indistinguishable. A `CANNOT_SEE` entry is owed with it: `0008:56-59`
  set the precedent that the boundary of a check belongs in the check's
  own output and not only in a migration docstring nobody runs.
- **Nothing enforces that `recycle_directory`'s `search_path` names the
  schema migration 0009 creates.** `server/db/init/00_init_roles.sql:87`
  runs `ALTER ROLE recycle_directory SET search_path = directory`, and
  the capitalised warning above it at `:76` says the name must match the
  schema 0009 creates. That is a bootstrap statement on one side and a
  comment on the other, with no assertion between them. Rename either
  and the other points nowhere; the observed failure is
  `relation "..." does not exist`, naming no schema, no permission and
  no migration — recorded as the DESIGNED pre-migration outcome at that
  file's `:78-86`, which means the broken state and the expected state
  are indistinguishable by their error message. **A DOWNGRADED database
  and a never-upgraded one are indistinguishable the same way** —
  `rolconfig` survives `alembic downgrade 0008` and still names a schema
  that no longer exists, measured this session on a throwaway
  immediately after a successful downgrade
  (`recycle_directory | search_path=directory` with
  `directory_schema_count = 0`). **The check that would
  catch it does not read the field:** S4 at
  `server/scripts/reconcile.py:886-888` selects `rolname, rolsuper,
  rolbypassrls` only, never `rolconfig`, and its `WHERE rolname IN
  ('recycle_app', 'recycle_owner')` at `:888` does not name
  `recycle_directory` at all — so a third role is outside its coverage
  in two independent ways. *Not done:* 0009 changes no checker, and the
  role list is hard-coded at three sites (`:885` title, `:888` SQL,
  `:891` the missing-role tuple) which must move together. *Unblocks:*
  S4 selecting `rolconfig` and naming `recycle_directory`, with the
  expected `search_path` asserted against the schema name rather than
  assumed.
  **DONE 2026-08-09 in `50e82c7`, and the paragraph above is KEPT because
  its line numbers are themselves the finding.** S4 now reads `rolconfig`
  and covers `recycle_directory`: `REQUIRED_ROLES` is the single
  declaration and carries `recycle_directory: {"search_path":
  "directory"}`; the SQL takes it as `= ANY($1::text[])`; the
  missing-role arm and the settings loop both iterate it. The three
  hand-kept copies this entry complained about are GONE rather than
  synchronised, which is why it closes. Comparison is per setting name,
  never the array whole, and `examined` reads "N of M roles; C of D
  declared setting(s) compared" with both halves enforced rather than
  displayed. **Every position cited above is now wrong** — `:885`,
  `:888`, `:891` and `:886-888` name none of what they claim, because
  `50e82c7` and `2c8f300` added 161 lines to that file. Re-derived
  2026-08-09: the declaration is at `:353-357`, the query at `:970-972`.
  That is the lesson `015bee3` recorded hours earlier about
  `00_init_roles.sql` — a citation carrying a POSITION rots, one naming
  the file and the symbol does not — and this is the next instance,
  inside the same day. *Still not done:* 0009 remains committed and
  unapplied, so nothing has yet confirmed that the `search_path` S4
  asserts names a schema that EXISTS; S4 checks the value and never the
  existence, which is `CANNOT_SEE` entry 2 and not this entry.
  **AMENDED 2026-08-09 — THE PREMISE OF THAT LAST SENTENCE IS GONE.** 0009 was
  **APPLIED TO THE LIVE DATABASE `recycle`**, so schema `directory` now exists
  there and `recycle_directory`'s `search_path=directory` names something real.
  **The GAP ITSELF IS UNCHANGED and this item stays open:** S4 still checks the
  VALUE of the setting and never whether the schema exists, so it would report
  green on a cluster where the schema is absent. What changed is that the
  condition is now satisfied on the one database that matters, by application
  rather than by any check noticing.

- **EVERY ABSENCE ASSERTION IN THIS PROJECT SITS ON THE SUCCESS PATH, AND THE
  REFUSAL PATH IS WHERE NOBODY LOOKS. Recorded 2026-08-10, and this is bigger
  than the defect that exposed it.** The absence assertions here are sharp and
  well-controlled — the create proof checks by NAME and on the RAW BYTES that a
  201 body carries no `password`, no `password_hash` and no `token_version`, and
  all three cells are green. **All three are about the 201.** A refusal, by
  convention in this repository, is asserted on its STATUS and its `code`,
  because that is what the contract names; **the BODY of a refusal is the thing
  no proof reads back.** So every route that constrains a field at the edge has a
  refusal shaped by the framework rather than by this repository, and not one of
  them has ever been asserted on for what it CONTAINS. The defect that made this
  visible is filed separately under code debt, and it is an instance rather than
  the finding: what is unproven is the shape of every refusal body this API can
  emit. **Not a positive-control failure** — the controls held and the cells
  could have gone red; they were pointed at the wrong response, which is a
  different miss and needs a different fix. *Not done:* no proof in the tree
  asserts on a refusal body, and no inventory exists of which routes constrain
  which fields at the edge. *Unblocks:* the cheap half is a rule — where a proof
  asserts a body's contents, write the sibling assertion on the REFUSAL body in
  the same run; the expensive half is deciding what a refusal body is CONTRACTED
  to contain, which nothing states today and which the code-debt entry below
  cannot be closed without.
  **PARTLY ANSWERED 2026-08-10, AND STILL OPEN — the two halves moved different
  distances.** The cheap half is exercised in exactly ONE proof:
  `prove_user_create.py` P6/H4 asserts on the raw bytes of a refusal body, with
  a presence sibling in the same response, and H1-H3 do the same across two
  routes. The expensive half is now answered FOR VALIDATION REFUSALS ONLY —
  `app/main.py::validation_error_handler` states what a 422 carries and what it
  never carries — and is untouched for every other refusal shape this API can
  emit: 401, 403, 404, 409 and 424 still have no contract on their bodies and no
  proof reads one back. **The inventory still does not exist**, so "which routes
  constrain which fields at the edge" is as unanswered as it was; what changed is
  that for one refusal species the answer no longer depends on the inventory,
  because the removal is unconditional rather than per field.

- **`prove_master_write.py` IS RED, AND IT WAS ALREADY RED BEFORE P1.8b TOUCHED
  ANYTHING — measured 2026-08-24, and the instrument matters more than the
  finding.** Four cells fail, the first being `POST /sellers -> 403, naming its
  kind` against an observed **201**. That gate moved off `require_admin` and onto
  `get_principal` on **2026-08-17 in `2f88403`** (P1.8a, "staff can create a
  seller"), and the proof was last modified on **2026-07-29 in `af11f71`** — so it
  has been asserting the OLD gate for the whole time the new one has been shipped.
  **ESTABLISHED BY RUNNING IT, NOT BY COMPARING DATES.** Two dates are an argument;
  what was done instead was to stash the phase's working tree, restart uvicorn on
  HEAD's code, CONFIRM that server answered **404** on the route P1.8b adds — so it
  is provably the old code — and run the proof against it. It produced the SAME
  FOUR cells, at the same line numbers, with the same text, `MASTERWRITE_EXIT=1`.
  The working tree was then restored and both files verified byte-exact by sha256.
  **The other three cells are downstream of the first**: with the create
  succeeding, "no row was created by any refused POST" is false, and the two C1
  cells comparing a 403 against a 424 are comparing a 201 instead.
  **NOTHING RECORDED IT.** Searched `PROJECT_STATUS.md`, `OPEN_ITEMS.md` and
  `ROADMAP.md` for `master_write` and `master-write`: nine hits, none of them a red
  after 2026-08-17 — **not found with these words**, which is a different statement
  from "there is no record". *Not done:* the four assertions still describe the
  pre-D1 gate. *Unblocks:* the repair is to assert what D1 actually decided — that
  `POST /sellers` is the ONE write on that router staff may do — which means cell
  R1's list loses `POST /sellers` and gains a positive assertion that staff CAN
  create one, and C1's five-way discrimination needs a different route to supply
  its 403. **Not this phase's to fix**, and deliberately not swept into it: the
  phase that broke it is closed, and a proof edited inside an unrelated commit is
  a proof nobody reviewed.
  **REPAIRED IN M4 c2 — 2026-08-29 (`320d8ee`).** The four
  assertions now describe the D1 gate: R1 drops `POST /sellers` and asserts staff
  CAN create a seller (201), C1 sources its 403 from `POST /uoms` (which keeps
  `require_admin`), and the docstring and cleanup follow. Re-derived at the
  artefact first — the unrepaired proof produced the same five cells against a
  :8000 server restarted on HEAD — then green TWICE (fixtures left behind: 0). 12
  orphan sellers (`NOPE-S-*`/`X-*`) that six prior red runs left in dev, none
  referenced by a bill, were removed.

- **NO STANDING CHECK EXISTS FOR THE ONE INVARIANT THAT SPANS `sellers` AND
  `seller_code_reservations`, and the reason it does not is legitimate — raised
  2026-08-25.** The invariant is: *no `sellers` row carries a code whose
  reservation is still `held`.* No CHECK constraint can express it, because it
  spans two tables; migration `0012` says so at
  `ck_reservations_spent_consistency`, which holds the other half — that `spent`
  and a non-null `seller_id` move together — and states in its own docstring that
  the cross-table half is beyond it. **So the only instrument that could hold it
  is `reconcile.py`, and it does not.**
  **WHY THE PROOF CANNOT SUPPLY IT.** `prove_seller_code_guards.py` asserts the
  invariant, and its queries are SCOPED TO THAT RUN'S OWN DEVICE IDENTITIES. That
  scoping is forced rather than lazy: the same proof's ADMITTED halves deliberately
  drive the OLD server into the defect — writing a `sellers` row carrying a code a
  device is still holding — because that is what makes each guard a measured pair
  rather than a restatement of the new code. Those rows are never reclaimed, so an
  unscoped query would read every earlier run's deliberate damage and the proof
  could not pass twice (`lessons/README.md § Lessons` "proof-must-run-twice.md").
  What is measured today is therefore that the CREATE PATH holds the invariant for
  the rows IT wrote, which is a smaller claim than the invariant.
  **IT IS INVISIBLE FROM EVERY INSTRUMENT THAT EXISTS.** `reconcile.py` now knows
  the relation — S1, S2, S3, B1 and X2 all cover it — but every one of those is
  about tenant_id, RLS, or the completeness of the sweep. **None of them compares
  the two tables**, and the per-tenant `SQL_CHECKS` set has no member touching
  reservations at all. *Not done:* a T-check pairing the two. *Unblocks:* it would
  have to enumerate, per tenant, every reservation in state `held` whose `code`
  appears in `sellers`, and report the pair — and it needs its complementary query
  in the same pass, or an empty result from a query that never matched anything is
  indistinguishable from an invariant that holds. **It also needs a decision this
  entry does not take:** the dev database is clean today, but any database a
  guards-proof run has ever touched holds deliberate violations, so the check would
  be red on every scratch copy and a reader would learn to ignore it — which is the
  failure `lessons/README.md § Lessons` "a-round-trip-must-agree-on-its-key-space.md"
  records as the slow way to arrive at no check at all.

- **TWO SCRATCH DATABASES ARE FOUR MIGRATIONS STALE, AND ONE OF THEM SILENTLY
  COSTS A PROOF — found 2026-08-24, pre-existing, not caused by P1.8b.**
  `recycle_users_scratch` and `recycle_clock_scratch` are both at **`0008`**, read
  from their own `alembic_version`, against a head of `0012`.
  `prove_user_create.py --database recycle_users_scratch` cannot run at all:
  uvicorn starts, the clock guard cannot evaluate because
  `server_clock_watermark` does not exist, `/health` never answers, and the script
  exits **2** — "could not run", which is the honest classification and is NOT a
  pass. `recycle_clock_scratch` is worse-shaped: `prove_docno_clock.py` runs green
  against it, so the staleness is INVISIBLE there, while anything needing a server
  bound to it would fail on `tenants.default_grade` (migration `0010`). Both proofs
  were run for this phase against freshly restored copies (`recycle_p18b_users`,
  `recycle_p18b_clock`) rather than by disturbing these two. *Not done:* nothing
  refreshes a scratch database and nothing reports one as stale. *Unblocks:* the
  cheap half is a line in the runbook; the real one is that a proof taking
  `--database` has no way to say "this copy is too old for me", so the honest fix
  is for a script that starts its own server to compare the target's
  `alembic_version` against the migration head and refuse with the restore command
  printed — the shape `prove_docno_clock.py` already uses for the LIVE database,
  pointed at a different fact.
  **CLOSED IN M4 c3 — 2026-08-29 (`b808fc2`).** Both were
  DROPPED. `recycle_users_scratch`(0007) and `recycle_clock_scratch`(0008) were
  stale with nothing to refresh them; the fresh replacements they were superseded
  by, `recycle_p18b_users` and `recycle_p18b_clock`, were themselves debris and
  were dropped too. Each measured before the drop (zero connections, no database
  comment, provenance re-read) and absence confirmed after — recorded in full in
  the scratch-database retention entry below.

## Code debt found and left in place

- **AN UNTRACKED `0015_tenant_grade_tiers.py` PRE-EXISTED THE P1.24 COMMIT-1a SESSION
  AND WAS OVERWRITTEN UNREAD — recorded 2026-08-31, NOT RECOVERABLE.** The session-start
  `git status --porcelain` (in the phase-brief handoff) held exactly ONE entry:
  `?? server/migrations/versions/0015_tenant_grade_tiers.py`. The commit-1a session
  `Write` to that path replaced it without reporting an overwrite-conflict and without
  reading the prior content first — a look-before-overwriting miss (the host's standing
  "before deleting or overwriting, look at the target" guidance, not a CLAUDE.md rule).
  The committed `0015` is the version proven on dev (up / backfill /
  down / guard). The prior file was UNTRACKED, so git never held it and its content is
  gone; measured this pass, nothing else from that earlier attempt survives: `git stash
  list` is empty, `git log --oneline -3` shows no P1.24 commit (HEAD `0b2aee4`), and the
  only other untracked path is this session's own new lesson. Recorded, not hunted for.
- **`GET /reports/summary`'s `by=day` query SEQ-SCANS `purchase_bills` — found
  2026-08-30 (P1.23 item 4 unit 2), NOT A DEFECT AT FIXTURE SIZE, RECORDED NOT
  FIXED.** `EXPLAIN` over the fixture shows a `Seq Scan on purchase_bills` filtered on
  `server_received_at` (and a seq scan on `purchase_bill_items`): there is no index on
  `(tenant_id, server_received_at)` — migration 0001 gives `purchase_bills` only
  `(tenant_id, id)` and `(tenant_id, doc_no)` — and the `by=day` bucket wraps the
  column in a function, so no index could serve that GROUP BY in any case. Identical
  to `/reports/daily`'s own "INDEX — NOT ADDED, ON PURPOSE" note in
  `server/app/reports.py`: fine at one shop's volume, a future-volume line for P2.4.
  See `ROADMAP.md § What the owner has settled` "S19 — P2.4 AND P2.5 STAY OPEN UNTIL A REAL SHOP TRADES".
  The eventual fix is one migration adding `ix_bills_tenant_received
  ON purchase_bills (tenant_id, server_received_at)`; this unit adds no index.
- **`GET /sellers/{seller_id}/history`'s query SEQ-SCANS `purchase_bills` — found
  2026-08-31 (P1.21 phase 1), NOT A DEFECT AT FIXTURE SIZE, RECORDED NOT FIXED.**
  `EXPLAIN` under a real tenant context shows a `Seq Scan on purchase_bills` filtered
  on `seller_id` and the RLS `tenant_id` predicate (and a `Seq Scan on
  purchase_bill_items`): migration 0001 gives `purchase_bills` only `(tenant_id, id)`
  and `(tenant_id, doc_no)`, so no index serves `WHERE seller_id = ?`. The SAME
  future-volume shape as the `/reports/daily` and `/reports/summary` siblings above;
  fine at one shop's volume, a P2.4 line (S19 keeps P2.4 open until a real shop
  trades). The eventual fix is one migration adding an index on
  `(tenant_id, seller_id, server_received_at)` (which also serves the newest-first
  ORDER BY and LIMIT); this phase adds no index.
- **`GET /sellers/{seller_id}/history` TAKES NO CURSOR AND NO DATE RANGE IN v1 —
  2026-08-31 (P1.21 phase 1), A CHOICE, NOT AN OMISSION.** The weighbridge picker
  wants the last few loads and `limit` (default 5, max 20) bounds them, so v1 takes
  no cursor (`before`/`after`) and no `from_date`/`to_date`. Paging further back, or
  by date, is a later line if a shop asks for it; recorded so the absence is not read
  as an oversight.
- **`mobile/src/sellerHistory/` IS ONLINE-ONLY — 2026-08-31 (P1.21 phase 2), A CHOICE,
  NOT A GAP.** There is no local per-seller history store; the panel reads
  `GET /sellers/{seller_id}/history` each time it opens, and offline it draws one calm
  sentence and no rows. Building a local history store is a sync-engine change (a new
  store plus a refresh path) and was out of this phase's bounds; recorded so the
  online-only behaviour is not read as an oversight. If a shop ever needs history
  offline, that is a later step.
- **THE STAFF DASHBOARD HAS NO PER-BILL LIST — `/reports/daily` HAS NO OWN-BILLS
  VARIANT, found 2026-08-31 (P1.23 item 4 unit 3), OWNER'S CALL, NOTHING AUTHORISED.**
  The today view shows the per-bill list from `GET /reports/daily`, which returns the
  whole shop's day with no `created_by = self` mode. A staff caller (who under E1 sees
  ONLY their own figures) therefore cannot be shown it without leaking other people's
  bills, so `dashboardView` replaces it with one sentence ("รายการบิลรายใบยังไม่รองรับ
  สำหรับบัญชีพนักงานในเวอร์ชันนี้"). *Not done:* nothing is built. Whether staff should
  get an own-bills daily list is the owner's decision; the eventual shape is either an
  own-filtered `/reports/daily` variant or a per-bill mode on `/reports/summary`.
- **DRILL-DOWN / SINGLE-KEY FILTER ON THE DASHBOARD IS DEFERRED — E5, 2026-08-31
  (P1.23 item 4 unit 3).** v1 is grouping + period only; tapping a bar to filter the
  summary to one product/seller/user/day is a later line of item 4 and needs a route
  parameter (`GET /reports/summary` takes no `key`/`filter` today). *Not done:*
  nothing built; a settled deferral (E5), recorded so the gap is not read as an
  oversight. See `ROADMAP.md § The completion sequence to handover`, the P1.23 item 4
  "DECIDED 2026-08-31" note.
- **`mobile/app.json`'s `apiBaseUrl` COMMENT NAMES A MOVED FILE — found 2026-08-29
  (M6 c3), FAILS SAFE, RECORDED NOT FIXED.** The comment at `mobile/app.json` line 31
  says the single reader is `device/src/config.ts`; that path does not exist.
  `mobile/device/src/config.ts` is absent (verified two ways: `test -e` and a
  `find mobile -name config.ts` outside `node_modules`), and the only `config.ts`
  under `mobile/` is `mobile/app/config.ts` — which IS the actual and single reader:
  it reads `expo.extra.apiBaseUrl` and exports `API_BASE_URL`, exactly as
  `ROADMAP.md § P1.2 — A server a shop can reach` already cites (`mobile/app/config.ts:24`).
  **IT FAILS SAFE:** the code resolves the value correctly regardless; only the
  human-facing comment misdirects the next reader — and `apiBaseUrl` is the one
  string the domain-timing decision now gates (S13's extension, and P1.11 bakes it
  in). *Remedy is a one-line comment edit* naming `app/config.ts`, left for a phase
  that touches this file rather than done here.
- **A PICKED LOCAL SELLER THAT LATER GOES `failed` LEAVES ITS BILL PARKED FOR
  EVER — found 2026-08-27 (P1.23 c3), FAILS SAFE, NOT REPAIRED.** The picker never
  OFFERS a `failed` seller (`listForPicker` returns only pending/syncing/synced),
  so this needs a pick-then-fail SEQUENCE: the operator weighs a bill against a
  local seller while its create is still owed, and the server then REFUSES that
  create on its merits (`markSellerCreateRefused` → `sync_state='failed'`,
  `server_seller_id` still null). The bill parked behind it is never resolved,
  because `resolveParkedBehindSettled`'s `fromSettledSeller` returns null on a row
  that never settled, so it stays parked. **IT FAILS SAFE, AND THE DIRECTION IS
  THE WHOLE POINT:** the bill is parked, VISIBLE and COUNTED (in `unsentBreakdown`
  and the sign-out gate), never a terminal 422 on cash already paid — the OPPOSITE
  direction from finding 1's original hazard, which let a local id reach `POST
  /bills` and took a terminal bill. This is a NEW INSTANCE of the
  parked-behind-a-seller-that-will-never-settle class the crash-window finding
  named, reached from a refused create rather than a crash. *Not done, and the
  remedy is a later DECISION and not a mechanism:* retry the create, prompt a
  re-pick, or offer a void — each a different operator story, none urgent while
  the row fails safe. Whoever takes it re-reads `mobile/src/sync/resolveParkedSeller.ts`
  first.
- **EVERY PROOF EXCEPT `proveOutbox.ts` CAN EXIT 0 WITH ITS RUN INCOMPLETE —
  found 2026-08-19 by a disproof that READ AS A PASS, and swept nowhere.**
  Each proof assigns its verdict in a trailing `.then`, and node's natural
  exit status defaults to success: a staged deadlock (an awaited signal that
  never comes) drains the event loop and the process exits 0 mid-proof with
  no exit line — measured when the leaked-pass-lock disproof printed EXIT=0
  over nine [FAIL] cells with `OUTBOX_EXIT=` absent. The rule and the whole
  incident are in `lessons/a-default-exit-code-is-a-default-verdict.md`; the
  remedy (preset `process.exitCode = 1` at entry, cleared only by a completed
  run) is applied in `proveOutbox.ts` alone, because the sweep was outside
  that commit's declared file set. *Not done:* the same preset in every other
  proof entrypoint — one line each, no behaviour change on any completed run.
  **THE FILES ARE NOT EQUIVALENT, AND A SWEEPER MUST NOT TREAT THEM AS ONE JOB —
  added 2026-08-23.** The hazard is an UNSETTLED await draining the loop, so it
  needs an await INSIDE `main()` to have anything to strand. Where `main()` is
  wholly synchronous the exposure is LATENT: the file lacks the guard AND lacks
  the hazard, `main()`'s promise settles in a microtask before the loop can
  drain, and a synchronous throw is caught by the entrypoint's own `.catch`.
  Measured today in `mobile/src/proof/proveSheets.ts` — `grep -n await` returns
  exactly ONE line, the top-level `await main()` at the entrypoint, and every
  cell it calls is a plain synchronous function; control in the same pass,
  `proveSellerCreate.ts` returns 35, so the instrument distinguishes. **The
  consequence for the sweep is that a LATENT file gives a sweeper no way to tell
  a correct preset from a typo'd one** — nothing can be staged that goes red
  either way — while a LIVE file can be checked by staging the deadlock the
  lesson describes. Do the live ones where the fix can be OBSERVED, and record
  the latent ones as unobserved-by-construction rather than as swept. A latent
  file also turns LIVE the first time somebody adds an `await` to a cell, with
  nothing announcing it.
  **NOT CLOSED BY P-SHEETFIRSTPRESS, deliberately.** That phase touched three of
  these files for a different defect and left the preset alone in all three; it
  is still owed everywhere except `proveOutbox.ts`.
  **SWEPT IN M4 c1 — 2026-08-29 (`8dffa93`).** The preset is
  now on 24 entrypoints; `proveTime` carries a documented exclusion at its site
  (its `process.exit(code)` overrides `process.exitCode`, so a preset there is
  inert). Per the owner's decision the LATENT files were guarded proactively
  rather than left unswept: the hazard is latent-not-absent and goes live the
  first time a cell gains an `await`. Split by this entry's own instrument
  (`await` reachable in `main()`): 20 LIVE (proveSync 155 down to proveLogin 17),
  whose preset firing IS observable and WAS staged on `proveCart` — a deadlock in
  `main()` gave exit 1 with no `CART_EXIT=` line; the identical pattern with no
  preset gave exit 0, the bug. And 4 LATENT — `proveSheets` (one await, the
  top-level `await main()`, cells synchronous), `proveMoney`, `proveEntry`,
  `proveDaily` — whose preset is a future-refactor guard, unobserved by
  construction exactly as this entry warned. Real-path run: 21 self-contained
  proofs exit 0 twice; the three integration proofs refuse without their server
  (`proveForbidden --offline` exits 2; `proveLoginScreen` and `proveLogin` exit
  non-zero), so no preset broke a completed run. Live-server green is owed:
  `proveForbidden` rides M4 c2, `proveLoginScreen` and `proveLogin` are
  server-gated to the next harness pass.

- **THE ADD-SELLER SHEET DOES NOT APPEAR ON THE FIRST PRESS — diagnosed
  2026-08-17 from the source, not guessed from the symptom, and NOT
  REPAIRED.** Two sibling `<Modal>` components — `mobile/app/SellerPicker.tsx:105`
  and `mobile/app/AddSellerSheet.tsx:205` — are rendered as SIBLINGS at
  `mobile/App.tsx:1830` and `mobile/App.tsx:1850`, each with its own `visible`
  prop (`pickerOpen`, `addSellerOpen`). `onAddSeller` at `mobile/App.tsx:1839`
  sets the second WITHOUT closing the first, and iOS will not present a second
  modal while the first is up.
  **SYMPTOM, reported by the owner and CONSISTENT rather than intermittent:**
  the `+ เพิ่มผู้ขาย` control does nothing on the first press; pressing `ปิด`
  to dismiss the picker makes the sheet appear. **That the sheet appears on the
  DISMISSAL is what proves the state was already set** — nothing is wrong in
  the handler, only in the presentation.
  **NO HEADLESS PROOF CAN SEE THIS.** It is native presentation behaviour, and
  `mobile/tsconfig.node.json` sets `rootDir: "src"`, so nothing under `app/`
  reaches the proof program in any case. What IS provable headlessly is the
  INVARIANT — the picker must be closed while the sheet is open. The BEHAVIOUR
  needs a device.
  *Not done:* three fix shapes, and **the trap is in the second**. (1) Render
  the sheet INSIDE the picker's Modal. (2) Close the first before opening the
  second — **ON iOS A SAME-TICK SWAP OFTEN STILL FAILS**, because the
  dismissal has to COMPLETE before the next presentation is accepted; this is
  the fix that looks obvious and is the one most likely to HALF-work, which is
  worse than not working because it will pass a hurried check. (3) One Modal
  whose content is switched.
  **SUPERSEDED 2026-08-23 — REPAIRED, and this entry has been wrong since 77
  MINUTES AFTER IT WAS WRITTEN.** The paragraph above landed at `56b5008`
  (2026-08-17 15:39:04 +0700) and `1204081` (2026-08-17 16:56:08 +0700) repaired
  it. **THE CAUSE IS ONE OMISSION, AND IT IS THE ACTIONABLE HALF: `1204081` DID
  NOT CLEAR ITS OWN QUEUE LINE.** That commit touched sixteen files, quoted this
  entry's own symptom in its message, and named `56b5008` as the "before" state —
  so the author had this paragraph open — and `OPEN_ITEMS.md` was not among the
  sixteen. Without that sentence the six days read as bad luck; they were a
  missing step in a commit that knew about this line. **A REPAIR IS NOT FINISHED
  UNTIL THE QUEUE ENTRY THAT SENT YOU DIES IN THE SAME COMMIT** — anything later
  is a second commit nobody is scheduled to make. What it then cost is the
  ordinary cost: a phase brief was written FROM this entry six days on, which is
  `CLAUDE.md § Workflow` "A REPORT IS A CLUE, NOT A SOURCE" with this file as the
  stale artefact, and the whole of P-SHEETFIRSTPRESS was spent re-deriving a
  repair that was already in the tree.
  **SHAPE (3) WAS CHOSEN, FROM THE SOURCE AND NOT FROM THE SYMPTOM.** One host,
  `mobile/app/SheetHost.tsx`, whose CONTENT swaps; the rule is the pure module
  `mobile/src/ui/sheetStack.ts`, a STACK and not a single slot, so closing the
  add-seller form returns to the picker where the search box is. Shape (2) — the
  trap named above — is refuted by `_shouldPresent = newProps.visible` being
  evaluated PER INSTANCE, which makes a single `openSheet` state RENAME the
  failure rather than remove it: `lessons/README.md § Lessons` "RECORDS INTENT, NOT OUTCOME".
  **EVERY LINE NUMBER IN THE PARAGRAPH ABOVE HAS ROTTED.** `SellerPicker.tsx` and
  `AddSellerSheet.tsx` render no `<Modal>` at all now — both carry a header
  saying so — and `mobile/App.tsx:1830`, `:1839` and `:1850` are other code.
  **THE DEVICE PASS HAPPENED**, at `72b9881` (2026-08-17 19:10:53 +0700), two
  hours after the repair: `archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md` "THE MODAL-HOST DEVICE PASS".
  **RE-MEASURED 2026-08-23, and NO SHA IS GIVEN because this correction was
  uncommitted at the moment the sentence was written** — the only sha available
  is the one that does not contain it. Both typechecks exit 0 run bare;
  `npm run prove:sheets` exits 0 TWICE in a row with no reseed, S0-S10; `rg`
  returns ONE `<Modal` line over `mobile/App.tsx` and `mobile/app/`,
  `mobile/app/SheetHost.tsx:67`, with a positive control of 14 files of 14 in the
  same pass. Three disproofs were run with the cell NAMED IN ADVANCE and each
  moved that named cell, every control staying green: `--break=coexist` took S2's
  `seller_picker>add_seller` to "asks for 2", `--break=two_hosts` took all four
  S6 moves to `host:<a> -> host:<b>`, `--break=scan` reddened S9.
  *STILL NOT DONE, and it is not the defect above:* the SECOND press — pressing
  `+ เพิ่มผู้ขาย` again after closing the form and returning to the picker — has
  never been observed on a handset. `72b9881` records the first press and records
  that closing returns to the picker; it does not record a press from there.

- **A COMMENT DESCRIBES A MECHANISM THAT STOPPED EXISTING AT `1204081`, AND ITS
  CONCLUSION IS STILL RIGHT — found 2026-08-23, NOT REPAIRED.**
  `mobile/src/master/sellerCreateNotice.ts:241` (line re-derived today, not
  copied) explains why the `session_expired` notice carries its own sign-in exit:
  the notice is drawn *"inside a Modal stacked over the picker, which is itself a
  Modal"*, so the status strip's sign-in button is physically under BOTH and
  cannot be reached. **There has been exactly one Modal in this app since
  `1204081`**, so the two-Modals clause names a structure that no longer exists.
  **THE CONCLUSION DID NOT MOVE**, which is what keeps this off the defect list:
  the strip is under the HOST, which is just as unreachable, so the exit is still
  needed and the notice is still right. `mobile/App.tsx:1780-1783` already
  carries the corrected reason in the `add_seller` arm — so the tree holds both
  the old mechanism and the new one, and only one of them is true.
  **THIS IS A STALE MECHANISM IN A COMMENT, NOT A LIVE DEFECT.** Nothing renders
  differently, no cell can go red, and no proof reads a comment. It is the shape
  `lessons/README.md § Lessons` "could this sentence become false without this file changing?"
  names: the sentence turned when a DIFFERENT file was edited, and nothing in the
  repository compares a comment to the code it describes.
  *Not done:* rewrite the clause to give the reason `App.tsx` already gives — the
  strip is under the host — without touching the notice, its wording, or any
  screen. Whoever does it should re-read the line number first; this entry's
  predecessor two entries up rotted every one of its own.
  **CLOSED 2026-08-30 (`49f9fd2`):** `mobile/src/master/sellerCreateNotice.ts`
  was DELETED at `94a0d47` (`git log --diff-filter=D` re-derived today; the commit's
  own subject names the act — "the online mint path and its two proofs are
  deleted"), so the stale comment no longer exists and the *Not done:* rewrite is
  moot. Its successor `mobile/src/master/localSellerCreateNotice.ts` is a
  notice-DATA module carrying NO Modal reference (`git grep -n Modal` → no match,
  positive control confirmed the file was read), so there is nothing to re-home.

- **A UVICORN PAIR HAS BEEN SERVING THIS REPOSITORY'S OWN API ON 127.0.0.1:8137
  SINCE 2026-08-07, RUNNING CODE THAT PREDATES SEVERAL COMMITS — and two of the
  three things wrong with it are not about the endpoint that found it. MUST NOT
  BE KILLED WITHOUT THE OWNER'S DECISION.** Measured 2026-08-10:
  PID **28972**, `python3.12` from the Windows Store distribution, started
  **2026-08-07 22:16:16**, command line
  `…\server\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8137`.
  Its parent, PID **26216**, is the venv python running the same launcher and is
  still alive, so **stopping it needs BOTH processes in the chain**; killing the
  child alone leaves the parent.
  **(1) IT IS OUR OWN API, not a stray process** — established from its command
  line, not guessed from its name.
  **(2) ITS `/health` CANNOT GO RED ON A WRONG CLOCK.** Asked, not inferred: it
  returns `{"status":"ok"}` with **no `clock` key**, so it predates the clock
  guard's health reporting entirely. **An operator who checks `/health` on 8137
  is structurally incapable of seeing a clock problem** — a green that cannot
  turn red, which is this repository's oldest failure shape, running unattended.
  **(3) IT HAS HELD A DATABASE CONNECTION SINCE 2026-08-07**, to whatever
  `APP_DATABASE_URL` named then, most likely the live `recycle`.
  **What it already cost:** it produced a FALSE GREEN. A proof that hardcoded
  port 8137 could not bind, and its health poll was answered by this server; two
  refusal assertions then passed against a route that did not exist. Asked
  directly, it declares **28 openapi paths and no `/auth/shop-code`**.
  *Not done:* nothing observable depends on it — it binds loopback only, so no
  handset can reach it, and `netstat` showed no established client connections —
  but it is not this session's to kill. *Unblocks:* an owner decision to stop
  both processes, after which the port stops being a trap and the misleading
  `/health` stops being reachable. **Its own piece of work, not a footnote to the
  endpoint that happened to find it.**

  **SUPERSEDED 2026-08-11 — THE PROCESSES ARE GONE, AND NOBODY HERE STOPPED
  THEM. THIS IS NOT THE ITEM BEING DEALT WITH.** The entry above is left exactly
  as written, and was true when written: it stood for days describing a pair
  that was genuinely running. Measured at `171f6d3`: **56 listening sockets on
  this box across 21 distinct process names**, and **nothing on 8137** — nor on
  8000, nor 8211. The enumeration is shown capable of finding processes by those
  21 names, so the silence about 8137 is a fact about the box rather than about
  the command.

  **WHAT IS NOT KNOWN IS WHY THEY WENT, and that is the part worth keeping.** No
  session in this project killed them; the entry forbade doing so without the
  owner's decision, and no such decision was taken or acted on. They were not
  stopped as a piece of work, they simply stopped being there — a reboot, a
  parent exiting, a cleanup by something outside this repository; none of it
  established, and none of it recoverable now. So the resolution is an ABSENCE,
  not an action.

  **THE THING THAT REPLACES THIS ITEM IS THE PROPERTY IT REVEALED: this box can
  lose a long-running process without anybody noticing.** That cuts both ways
  and the second way is the dangerous one. It ran for days unnoticed serving
  stale code with a `/health` that could not go red — and it then vanished
  unnoticed too. Nothing here watches process lifetime, so the same silence
  covers a server that should not be running and one that should. A future
  session finding a port empty must not read that as "the queue item was
  handled": it is the same instrument reporting nothing in both directions.

  *Not done:* nothing was fixed. The three properties recorded above — that it
  was our own API, that its `/health` was structurally incapable of reporting a
  clock fault, and that it had held a database connection since 2026-08-07 —
  were never acted on; the process holding them left on its own. *Unblocks:*
  nothing, and the owner decision the entry asked for is now moot for THESE
  processes and unanswered for the next ones.
  **RE-MEASURED IN M4 c3 — 2026-08-29: STILL ABSENT, and by more than an empty
  port.** M4 c3 was briefed to kill the :8137 pair; there was nothing to kill.
  Measured: no `:8137` socket in ANY state, and a POSITIVE enumeration of every
  `python.exe` running uvicorn on this box returned exactly one — the legitimate
  `:8000` dev pair (PID 8888 -> child 6744, both `-m uvicorn app.main:app --port
  8000`, started 13:19:33 when this session restarted it for the boot check), which
  is NOT a target. So the absence rests on a positive process census, not only on a
  silent port, exactly as this entry's own caution demands. No kill was performed.

- **`prove:forbidden` DEFAULTS TO THE PORT A DEVELOPMENT API LISTENS ON, AND THAT
  API IS BOUND TO THE LIVE DEV DATABASE. A SUITE RUN WITH NO EXPLICIT TARGET
  WRITES BILLS INTO `recycle`.** `mobile/src/proof/proveForbidden.ts:710` reads
  `process.env.RECYCLE_API_BASE ?? "http://127.0.0.1:8000"`, and that proof POSTs
  bills. Nothing about running `npm run prove:forbidden` announces which database
  is about to receive them.
  **MEASURED AT `acea1ac`, during the P1.7 step 6 pass:** 58 listening sockets
  across 23 distinct process names, and on port 8000 a `python3.12`, PID 4620,
  started 2026-08-11 20:12:04, command line
  `…\server\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000`.
  Asked of the cluster rather than inferred, `pg_stat_activity` showed its one
  `recycle_app` connection on database **`recycle`**. It was started outside this
  project, and was left running and untouched.
  **THE DEFAULT IS THE DEFECT, NOT THE PERSON WHO STARTED THE SERVER.** Running a
  development API on 8000 against the dev database is the ordinary thing to do,
  and `mobile/app.json` points the handset at that host. What is wrong is that a
  proof silently ADOPTS that address when no target is given, so the safe command
  and the destructive one are the same keystrokes. The pass that found it set
  `RECYCLE_API_BASE` explicitly for every API-touching proof and pointed them at a
  throwaway — a discipline held by whoever remembers, which is what
  `lessons/a-proof-must-establish-what-it-is-talking-to.md` says not to rely on.
  There, a hardcoded port was answered by a different server and two refusal
  assertions passed against a route that did not exist; the same shape here is
  worse, because this one WRITES.
  *Not done:* the default is unchanged. Candidates, none chosen: refuse to run
  with no `RECYCLE_API_BASE` set; refuse a target whose database resolves to the
  live one; or ask the server which database it is on and abort unless it is a
  scratch. All three change a proof's contract and belong with the owner.
  *Unblocks:* nothing, but it removes a way to lose live money data to a
  correctly-typed command.

*The five entries immediately below were all measured on 2026-08-10, read-only, on
the live cluster, as part of the `recycle_directory` privilege pass. Each is a
capability or a location that **no file in this repository asserts**. They are kept
separate rather than merged because their consequences differ, and one of them is
not about this role at all.*

- **`recycle_directory` holds `TEMPORARY` on every `recycle*` database, and the
  passage written to prevent exactly this understatement does not mention it.**
  `has_database_privilege('recycle_directory', <db>, 'TEMPORARY')` is `t` on all
  nine, conferred by the PUBLIC entry `=Tc/recycle_owner` in each `datacl`.
  `0009:62-72` exists specifically to state "the true baseline and not the
  flattering one" — it names `CONNECT`, and `USAGE` on `pg_catalog` and
  `information_schema`, and stops. **`TEMPORARY` is a WRITE capability**: the role
  may create objects in its own `pg_temp` schema and consume disk, which is not
  something a reader of "reads the shop directory and nothing else"
  (`server/db/init/00_init_roles.sql:38`) would predict. *Not done:* it was
  measured from the catalogue and deliberately **not exercised**, because creating
  a temp table is a write and that pass took none — so the privilege is proven
  present and its effect is unproven. *Unblocks:* either a
  `REVOKE TEMPORARY ON DATABASE ... FROM PUBLIC` in a migration
  (`lessons/README.md § Lessons` "revoke-in-migration.md" applies — it belongs in a
  migration, not a one-off), or a sentence in `0009`'s baseline paragraph admitting
  it. Not both, and neither is done.

- **`CONNECT` on `recycle` is held TWICE, and the explicit grant is not what
  confers it.** `datacl` reads
  `{=Tc/recycle_owner,recycle_owner=CTc/recycle_owner,recycle_app=c/recycle_owner,recycle_directory=c/recycle_owner}`
  — the leading `=Tc` is **PUBLIC**, so every role on this cluster already holds
  `CONNECT` on the live database. `server/db/init/00_init_roles.sql:92-93` grants it
  again explicitly to `recycle_app` and `recycle_directory`. **Revoking those two
  explicit grants would remove no access at all.** *Why it matters:* anyone
  reasoning that a role is confined because it was granted `CONNECT` to one database
  has the mechanism backwards — `CONNECT` is not a boundary here for any role, and
  the boundary that does exist is the schema `USAGE`. *Not done:* nothing is broken
  today and the fix is a `REVOKE ... FROM PUBLIC` whose blast radius is every role
  and every database on the cluster, which is a decision and not a tidy-up.

- **The role can connect to eight databases besides the live one, including a
  restore of live data — and one of those carries an explicit grant no file
  accounts for.** All nine `recycle*` databases are reachable by the same PUBLIC
  `=Tc` mechanism. **`recycle_restore_scratch` additionally carries
  `recycle_directory=c/recycle_owner` in its `datacl`**, an explicit `GRANT CONNECT`
  that appears in no migration, in no `db/init` file and in no document; the
  bootstrap script grants on `recycle` only. *Measured, and this is the reassuring
  half:* containment HOLDS in all nine — `public` `USAGE` is `f` and every read of
  `public.tenants` is refused at the schema — so this is **reach, not exposure**.
  *Not done:* the origin of that grant is unexplained. It was presumably issued by
  hand while building the fixture, but nothing records it, and an unexplained grant
  on a database holding real money data is worth an explanation or a revoke.

- **"No `USAGE` on schema `public`" is a property of the DATABASE `recycle`, not a
  property of the role — and in the `postgres` database the same role DOES hold
  it.** This is the entry that is not about `recycle_directory` at all.
  `server/db/init/00_init_roles.sql:101` runs `REVOKE ALL ON SCHEMA public FROM
  PUBLIC` **after** `\connect recycle` at `:95`, so it only ever applied to that one
  database. Measured in `postgres`: `has_schema_privilege(..., 'public', 'USAGE')`
  is **`t`**, with `nspacl` at the PostgreSQL 15+ default
  `{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}`. *The hole has
  nothing behind it today* — that schema holds **0 relations**, and 0 readable — and
  `CREATE` is `f`, so no permanent object can be added. *Why it is recorded anyway:*
  **three** files state the no-`USAGE` property as though it travels with the role —
  `server/db/init/00_init_roles.sql:38-41`, migration `0009:55-59`, and
  `ARCHITECTURE.md:609-611` (re-derived 2026-08-10; it read `:604-605`, which had
  rotted, and `:607-609` was itself stale within the same round). It does not.
  Any new database on this cluster starts
  with PUBLIC holding `USAGE` on its `public` schema unless something revokes it,
  and the only thing that ever revokes it is a script that runs on an empty data
  directory. *Partly addressed in the commit that records this:* `server/README.md`
  was a FOURTH site and now names the database; `ARCHITECTURE.md` carries an
  appended correction in its §13 rather than an edit to D2, per that section's own
  rule. **The two `server/` sources are NOT corrected** — one is an applied
  migration and one is the bootstrap script, and changing either is a separate
  decision rather than a documentation fix. *Unblocks:* a `CANNOT_SEE` entry on
  `reconcile.py`'s S4, whose subject is the cluster, and a decision about whether
  the revoke belongs in a migration so that it travels with the schema.

- **`recycle_directory`'s `search_path` is set cluster-wide, not per database, which
  widens the gap already recorded under "Nothing enforces that `recycle_directory`'s
  `search_path` names the schema migration 0009 creates".** `pg_db_role_setting`
  holds exactly one row and its `setdatabase` is `0` — `<ALL DATABASES>`. So
  `search_path=directory` applies in all **twelve** databases on this cluster,
  including the five `recycle*` below 0009 plus `postgres` and `template1`, none of
  which has a schema called `directory`. *What changes:* that entry describes the
  failure as reachable on a downgraded database. It is reachable on **seven**
  databases right now, and the error names no schema, no permission and no
  migration in every one of them. *Not done:* S4 still checks the VALUE of the
  setting and never whether the schema exists; that half is unchanged.

*Two negatives from the same pass, recorded because they bound the claims above
rather than extend them: the role holds **zero role memberships in either
direction**, which closes the inherited-privilege path a grant listing cannot rule
out; and `pg_authid` and `pg_shadow` are both **refused**, which bounds `0009:68-70`'s
"it can enumerate the SHAPE" — that reach stops short of credentials.*

- **A red build still overwrites `dist/`, and the only thing between that
  and RUNNING it is the `&&` in an npm script.**
  `mobile/tsconfig.node.json` does not set `noEmitOnError` (read
  field-by-field: it is absent), and `tsc` emits by default even when
  type checking fails — so a compile with errors writes JavaScript into
  `dist/` and exits non-zero. What holds today is the shell, not the
  compiler: `"build": "tsc -p tsconfig.node.json && node
  tools/finish-build.mjs"` and every `"prove:*": "npm run build && node
  dist/proof/….js"` (`mobile/package.json:11-27`), where the `&&` refuses
  to run the proof after a failed compile. **The gap is the direct
  invocation.** Anyone running `node dist/proof/proveSignOut.js` by hand
  after a red build executes emitted output that does NOT correspond to
  `src/`, and nothing on screen says so — the proof prints its own greens
  from stale code. *Not done:* it has never bitten, and the npm scripts
  are the documented path, so this is a latent trap rather than an
  observed failure. *Unblocks:* `"noEmitOnError": true` in
  `tsconfig.node.json`, which makes the guarantee a property of the
  compiler instead of a property of which command someone happened to
  type.
- **`npx expo export` DEFAULTS ITS OUTPUT TO `dist/` — the same directory
  `npm run build` compiles the node proofs into, and it has ALREADY HAPPENED.**
  Not a hypothesis: `mobile/dist/_expo/` and `mobile/dist/metadata.json` are
  dated **2026-07-22**, left by a bare `expo export` run, while
  `mobile/dist/proof/*.js` was rewritten **2026-08-17** by the proof build. Two
  unrelated tools write one directory, four weeks apart, and both outputs are
  live in the tree today. `--output-dir <dir>` is the flag, and its default is
  the trap (`@expo/cli`'s export command: `Default: dist`). **This is the
  neighbour of the entry above, not a restatement of it** — that one is about a
  RED BUILD leaving stale JS that a hand-run proof would execute; this is about a
  DIFFERENT PROGRAM'S artefacts landing in the same place, which no `&&` and no
  `noEmitOnError` can reach. *Not done:* P1.12 avoided it by passing
  `--output-dir` explicitly, and nothing has yet run a proof against the mixed
  directory. *Unblocks:* either a separate export directory fixed in
  `app.json`/scripts, or `dist/` split so the two programs cannot share it.
- **THERE ARE NOW TWO LOCKFILES, AND THE TWO INSTALLS ARE FREE TO DRIFT.**
  P1.12 added a workspace root whose `package.json` declares
  `workspaces: ["packages/*"]` and deliberately does NOT list `mobile`, so
  `npm install` at the root resolves only `packages/*` and `npm install` in
  `mobile/` resolves only mobile — two lockfiles, `package-lock.json` at the root
  and `mobile/package-lock.json`, neither aware of the other. **This is the
  ACCEPTED PRICE of not hoisting, not an oversight**: membership would have made
  Expo's `getDefaultConfig` set `nodeModulesPaths` and `disableHierarchicalLookup`
  automatically, which is the R4 configuration in
  `lessons/README.md § Lessons` "metro-file-map-nesting.md" that broke every
  nested dependency, and the nesting it breaks is live here
  (`mobile/node_modules/expo/node_modules/expo-asset`). *Not done:* deliberately;
  recorded so nobody "tidies" it by adding `mobile` to the workspace list without
  knowing what that switches on. *Unblocks:* nothing today. It becomes a real
  question only if a second package needs a dependency mobile also has.
- **`shopTime.ts`'s NEXT CONSUMER block still says PORT, and the answer is now
  IMPORT.** P1.12 moved the module byte-identical into
  `packages/shop-time/src/shopTime.ts` so that every `shopTime.ts:NN` line
  reference in `ARCHITECTURE.md`, `PROJECT_STATUS.md` and `SRS_MAP.md` kept
  resolving — which means its own paragraph at `:45-51`, written when there was
  nowhere to import from, still instructs the desktop to PORT the offset
  constant, the brand and the ordering rule. Porting it now would manufacture
  exactly the second implementation that paragraph exists to forbid. The
  correction is carried at the point of use in
  `packages/shop-time/src/index.ts`, which is what a desktop author opens first.
  *Not done:* editing it inside a MOVE would have shifted every line reference in
  the same commit that moved the file, so the two changes were kept apart.
  *Unblocks:* P1.13; do it before the desktop slip is written, not after.
- **`TAP_MIN` is a stated standard honoured in two screens and undercut
  everywhere else.** It is `56`, DUPLICATED as a local constant in
  `mobile/app/CartScreen.tsx` and `mobile/app/SellerPicker.tsx` (free to
  drift), while the rest of the UI uses raw `minHeight` literals —
  including **36** (`App.tsx`, `StatusStrip.tsx`) and **44**
  (`CartScreen.tsx` ×3, `DailyScreen.tsx`), both BELOW the standard.
  **AMENDED 2026-08-31 (P1.23 item 4 unit 3): `DailyScreen.tsx` was DELETED, so its
  `44` example no longer applies; its replacement `app/DashboardScreen.tsx` uses
  `TAP_MIN` on its controls and its sibling `app/BillList.tsx` has no tappable control.
  The finding otherwise stands.**
  *Not done:* found during a constants sweep, which was bookkeeping;
  changing tap targets is a behaviour change. *Unblocks:* a decision
  that the standard is real — then one shared constant and a sweep of
  every literal, not just the two below 56.
  **CLOSED 2026-08-30 (P1.23 item 3 phase A): the standard is real and the sweep is
  done.** `TAP_MIN = 56` is now ONE exported constant with its recorded reason (the
  owner's B1 wet-hand-target bar) in `mobile/src/ui/theme.ts`, read app-wide through
  `useTheme().tapMin`. The re-derived truth at phase start was WIDER than this entry:
  `const TAP_MIN = 56` was duplicated in SIX files (AccountScreen, AddSellerSheet,
  CartScreen, DashboardScreen, SellerPicker, SettingsScreen) plus `const KEY_H = 56`
  in Numpad, and raw sub-56 floors sat in 18 `minHeight` sites (36 ×2, 44 ×3, 48 ×13) —
  the "two screens" above had rotted as units 1 and 3 added their own copies. All are
  gone: a new text scanner (`mobile/src/ui/tapAudit.ts`) reads every `app/*.tsx` and
  `App.tsx` and `mobile/src/proof/proveTapAudit.ts` asserts ZERO raw `minHeight`/`minWidth`
  and ZERO local tap constant, with a planted-`minHeight:44` positive control and a
  `--break=inject` disproof; it is green. The scanner reads TEXT not layout — a
  flex-sized control's rendered height is the owner's handset pass, stated in its docstring.
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
- **Eight tuned constants have no recorded reason** — the sync tick, the
  UI refresh tick, the transport timeout, the undo window,
  the bill-list page size, both backoff knobs, and the JWT lifetime.
  None is wrong; all are **unaccountable**, which means none can be
  safely changed. Two other decisions rest on the JWT lifetime alone.
  *Not done:* a reason cannot be recovered after the fact, and inventing
  one is worse than a blank. *Unblocks:* nothing — this is a standing
  hazard. The trial ledger in `PROJECT_STATUS.md` exists to stop it
  compounding: any change to one of these values is a TRIAL and gets a
  row.
  **AMENDED 2026-08-30 (P1.23 item 3 phase A): NINE → EIGHT, `TAP_MIN` removed from
  the set.** It now has its recorded reason (the owner's B1 wet-hand-target bar) in
  `mobile/src/ui/theme.ts`, so it is no longer unaccountable. The same count is
  quantified in two other files and both were changed in this pass: `ROADMAP.md`'s
  "nine unaccountable tuned constants" and `PROJECT_STATUS.md`'s trial ledger, whose
  "Nine values were chosen" list and its own `TAP_MIN` row both drop it (the
  a-quantified-sentence-names-no-member sweep — the count lives in three phrasings
  across three files).
- **`ck_users_token_version` is deliberately NOT in `reconcile.py`'s
  `REQUIRED_CONSTRAINTS`.** Migration 0005 adds the constraint, and S5
  exists precisely to catch a guarantee silently dropped — so on the face
  of it, it belongs there. *Not done:* `prove_reconcile.py` restores a
  COPY from a dump, and **a dump taken before 0005 has neither the column
  nor the constraint**, so S5 would go red on every such copy for a
  reason that has nothing to do with money. "The money is wrong" and "the
  fixture predates the schema" must never share an exit code. *Unblocks:*
  a dump taken AFTER 0005 becoming the oldest one anyone restores from —
  then add the line. Until then the constraint is enforced by Postgres on
  the live database regardless; what is missing is only the checker's
  assertion that it is still there.
- **`fk_bills_created_by` is deliberately NOT in `REQUIRED_CONSTRAINTS`
  either — same argument as the line above, and filed beside it on purpose
  because both wake on the same condition one migration apart.** Migration
  0006 adds the constraint and S5 exists to catch a guarantee silently
  dropped, so on the face of it it belongs there. *Not done:*
  `prove_reconcile.py` restores a COPY from a dump, and a dump taken before
  0006 has neither the column nor the constraint, so S5 would go red on
  every such copy for a reason that has nothing to do with money. **"The
  money is wrong" and "the fixture predates the schema" must never share an
  outcome.** *Unblocks:* a dump taken AFTER 0006 becoming the oldest one
  anyone restores from — then add both lines together. Postgres enforces
  the FK on the live database meanwhile; what is missing is only the
  checker's assertion that it is still there.
- **Ten bills in the dev database carry an authorship the product would
  never have written, and hard rule 5 means they cannot be removed.**
  Written 2026-08-07 by the two mutations that disproved `prove_bills.py`'s
  new `created_by` assertions: run `e903453d` left five bills with a NULL
  author (the column removed from the INSERT), run `e63a1c76` left five
  naming the seeded staff user on bills an ADMIN submitted (a hardcoded id
  in place of `principal.user_id`). Both runs are identifiable only by the
  token in their `idempotency_key`. **They came through `POST /bills`, so
  they are schema-valid, satisfy the composite FK, pass every
  `reconcile.py` check — which does not read `created_by` — and are
  indistinguishable by inspection from genuine staff-created bills, which
  is precisely the harm the column was added to prevent.** *Not done:*
  nothing removes them short of replacing the volume, which is what the
  2026-08-03 rebuild did and what it cost. *Unblocks:* nothing — this is a
  permanent record, not a task. The rule it produced is
  `lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md`:
  a mutation on a protected write path runs against a restored scratch
  copy, and DEV IS NOT SCRATCH.
- **`prove_backup_restore.py` adds one permanent AUTHORLESS bill per run,
  by design, and that will not stop.** Its marker is a DIRECT INSERT
  (`prove_backup_restore.py:208`) — deliberately, so the proof keeps
  working when no API is running — and it is VOIDED rather than deleted
  (hard rule 5), so `created_by` stays NULL on it forever. Measured
  2026-08-07: of **seven** authorless bills written after migration 0006,
  five were the mutation rows above and **two were these markers**; nothing
  else produced one, and the stale pre-0006 uvicorn on port 8000 produced
  ZERO before it was killed. *Not done:* nothing to do — this is correct
  behaviour, recorded so the count is not re-discovered later as a defect.
  It is also the concrete reason the NULL-prefix check under Decisions open
  stays a proposal: that check would go red on every run of this proof.
  *Unblocks:* n/a.
- **A LOCKED ACCOUNT'S PHONE INVITES THE OPERATOR TO SIGN IN, AND THE SIGN-IN
  CANNOT WORK. A loop, and it is `R2b`'s shape rather than an accepted cost.**
  Migration 0007 makes `POST /auth/login` refuse a deactivated account with a
  body byte-identical to a wrong password — deliberate, and argued at the lock
  check in `server/app/main.py` — while `get_principal` refuses the tokens that
  account already holds. The mobile client maps every 401 to `session_expired`,
  which draws `หมดเวลาเข้าใช้งาน` with a `เข้าสู่ระบบ` button. So a dismissed
  employee's handset tells them to sign in; the sign-in is refused with a body
  it cannot tell from a typo; and the screen tells them to sign in again.
  **Nothing on the device ends that loop and nothing on the screen says why**,
  which is precisely the R2b amendment to
  `lessons/correct-classification-can-still-render-as-an-error.md`: a sentence
  naming an action the system cannot perform. *Not done:* **found by reading the
  client against the server change, NOT observed on a handset** — no device pass
  has been run against a locked account, and staging one is the first thing that
  should happen, because everything above this sentence is derivation rather
  than observation. It is also not a server defect: the server behaves as
  designed and both halves of that design are proven (`prove_revocation.py`
  CASE 7). *Unblocks:* **`ROADMAP.md § STAGE 3` "User management inside a shop"**,
  which owns that screen and is the step this lock capability was built for. The
  question it has to answer is what a phone may honestly be TOLD, given that the
  login refusal is deliberately indistinguishable: a client cannot derive "your
  account is locked" from a 401 it cannot tell from a mistyped password, so
  either the operator gets something honest and vague, or the refusal vocabulary
  changes and the username-oracle argument is re-opened. **That is a decision,
  not a fix, and it is the owner's.**
- **The refusal vocabulary wants its own module.** `kind`/`code`/`message`
  builders are now spread across three files — `auth.forbidden` and
  `auth.unauthenticated`, `master._not_found`/`_invalid`/`_conflict`, and
  `bills._master_data_missing` — and `app/users.py` imports the private
  `master._not_found` across module boundaries to avoid restating a
  convention (`lessons/a-checker-must-not-share-the-code-it-checks.md`:
  duplicate arithmetic, never duplicate a convention). Importing is the
  right call and the import is the wrong shape. *Not done:* deliberately
  not refactored during R1a — moving every refusal builder touches every
  handler in the API, which is not a change to make inside a security
  phase. *Unblocks:* one `app/refusals.py` holding all of them, and the
  four call-site modules importing from it. No behaviour change; the
  bodies on the wire must come out byte-identical, which is what makes it
  safe to do in its own commit.
- **P1.10 REPAIRED `prove_reconcile.py`. FIVE THINGS IT DID NOT REMOVE, each of
  which can still turn that proof red for a reason that is NOT a money defect.**
  Written down because the repair was scoped to the four failing cells and these
  were surveyed in the same pass; none is a new hazard, and all five were
  previously unrecorded.
  - **The X3 probe is still a RACE, and it now FAILS CLOSED.** `-u` on the child's
    argv makes the marker arrive during the sweep instead of after it, but the
    sweep must still not finish between the marker arriving and the INSERT
    committing. If it does, X3 does not fire and the cell is **RED** — there is
    no path to a false green, which is the acceptable direction and is stated at
    the call site. On a small copy this is a real flake risk. *Not done:* the
    marker used (`=== structure`) is genuinely the earliest SAFE point — anything
    sooner risks the row landing before the window opens, which would be a silent
    false negative rather than a red. *Unblocks:* a synchronisation point the
    probe CONTROLS rather than one it watches, which reconcile.py does not
    currently offer.
  - **`normalise()` carries a hardcoded `interval '7 years'`, and against a
    current dump it does nothing at all.** That shift repairs the one debris cause
    it was written for — `prove_daily_report`'s old 2019 fixture day, seven
    Gregorian years adrift — and a differently-adrift fixture would not be
    repaired by it. It is a fourth database-shaped constant of exactly the family
    P1.10 removed, currently DORMANT: every run now reports `DELETE 0, DELETE 0,
    UPDATE 0`, and the diagnosis claim beside it correctly SKIPs because the dump
    arrives clean. **So ~55 lines of normalisation logic run against nothing on
    every run and their own correctness is unobserved.** *Not done:* out of
    P1.10's scope, and it fails closed (the "clean copy to inject into" check goes
    red). *Unblocks:* deciding whether that block still has a job now that the two
    debris sources are fixed at source.
  - **An undo is not transactional.** `exec_all` runs an injection's undo
    statements one at a time with no transaction, so a failure part-way through
    leaves the copy half-restored — e.g. T3 restoring the weight but never
    re-adding `ck_items_net`, after which S5 is red for every following injection
    under `mode="exact"` and the run reads as the checker misbehaving. *Not done:*
    it has never fired, and each injection's own "undoing returns the copy to a
    clean exit-0 run" cell does catch it with a distinguishable label. *Unblocks:*
    wrapping apply and undo in one transaction.
  - **A dump older than the schema the checker requires goes red for its AGE.**
    `REQUIRED_CONSTRAINTS` and `REQUIRED_INDEXES` are read out of migrations 0001
    and 0002, so a pre-0002 copy has no `doc_no_counters` and S3 reports it
    missing. This is the inverse of the two entries above about
    `ck_users_token_version` and `fk_bills_created_by` being deliberately EXCLUDED,
    and it is inherent to restoring from arbitrary dumps rather than a defect.
    *Not done:* nothing to do until someone restores from a dump that old.
  - **A run that dies between the X3 INSERT and its DELETE leaves a probe tenant
    in the copy.** Harmless in itself — an empty tenant is clean — and healed by
    the next `--from` restore. It matters only because the derived expectations
    are read once in `fixtures()`; they would read the inflated count correctly,
    but a future edit that read the count later would not. The drift check added
    in P1.10 (`the tenant count … has not moved since fixtures`) is what stands
    between those two. *Not done:* nothing to do; recorded so the drift check is
    not deleted as ceremony.
- **A stale comment cites a TypeScript config that no longer exists**
  (`mobile/src/device/expoSqliteDriver.ts`). *Not done:* comment only,
  nothing depends on it. *Unblocks:* one edit, whenever that file is
  next touched.
- **A malformed date on the daily report returns the framework's own
  422 shape**, not the `kind`/`code` error vocabulary the rest of the
  API uses. *Not done:* no client sends one yet. *Unblocks:* a validator
  on that parameter — small, and worth doing before a second client
  consumes the endpoint.
- **`pipe_gate.py` refuses a check script being READ, not only one being
  RUN — SECOND false-positive class, FOUND 2026-08-08 when the gate
  refused its own author mid-verification.** The matcher hits a check's
  FILENAME regardless of whether the command invokes it:
  `sed -n '199,215p' prove_clock_guard.py | head` runs no proof, and is
  blocked, because `prove_\w*\.py` matches and a pipe follows. `sed`,
  `cat`, `head`, `wc`, `grep` and every other reader over a check script
  are affected, and reading a proof through a pager is a normal thing to
  want. Phase B named the FIRST class — a check name appearing only as
  quoted data, `grep "pytest" . | head` — and did not see this one.
  *Not done:* nothing. **The bias stays**: telling a reader from an
  invoker needs argv-position analysis the gate deliberately does not
  attempt, and the opposite error manufactures a green, which is the
  whole reason the gate exists. Recorded in `pipe_gate.py`'s own
  docstring as well, because that is where the next person looks.
  *Unblocks:* nothing is blocked. Workaround is to read the file bare or
  redirect to one.
- **A 409 AND A 503 FEED THE PER-BILL POISON ALARM, AND BOTH ARE TRUE OF
  EVERY BILL — FOUND 2026-08-08, CONFIRMED by reading. SEQUENCE: THIRD
  of three; mobile-side, and it blocks nothing.**
  `mobile/src/adapters/httpTransport.ts` `sendBill` handles 201, 200,
  400/422, 401, 403 and 424 and has **no 409 case**, so the year gate's
  new `be_year_not_contiguous` falls to the catch-all at `:163-165` as
  `{kind:"unavailable", reachable:true}`. The clock guard's 503 maps
  there too, per `:12`. And `:15-16` documents `reachable: true` as "the
  poison signal ... which the UI escalates to a loud alarm" — so the yard
  is told one NAMED bill has failed repeatedly and to contact support,
  when nothing is wrong with that bill or with any bill. (The 409 at
  `:221` is `voidBill`, a different method, where it means success.)
  **This is the THIRD instance of the class** after 401 (2c-7) and 403
  (2d), and **the first this project added deliberately** — the guards
  committed on 2026-08-08 are what created it. `engine.ts:627` states the
  rule it breaks, in its own words.
  **It composes with the re-opened decision under `Decisions open`:** if
  a tenant's year gate refuses for up to a year, this is not a transient
  misfire but a permanent red alarm naming one bill for the whole
  outage, while head-of-line ordering dams the queue behind it. That
  raises its severity without changing its position, because it still
  blocks nothing.
  *Not done:* nothing changed. *Done when:* neither condition reaches the
  per-bill counter, and a proof drives repeated 409s and repeated 503s
  and asserts on the RENDERED strip rather than on the classification.
  Which class they should take instead — 424-style parking is the obvious
  candidate, since the year gate's own description matches "resolvable" —
  is a DESIGN decision and is not settled here.
  **BLOCKED 2026-08-08 ON THE RE-OPENED DECISION under `Decisions open`,
  and the analysis below is recorded so it does not have to be
  re-derived.** The block is not sequencing convenience: the fix for that
  decision may remove the 409-forever case entirely, and if it does the
  classification below stays correct while its worst consequence
  disappears — which changes what the wording has to carry. Building the
  wording first would be making a symptom legible and calling it handled.
  **THE CLASSIFICATION, derived and not implemented.** *409 is a
  RESOLVABLE refusal:* the bill is well-formed and would be accepted
  unchanged once the server's counter state or clock is corrected, so it
  passes `lessons/unavailable-is-not-rejected.md`'s test — "can anything
  make this bill valid later, and does the failure NAME what" — and the
  server names it in the body. Same class as the 424 already handled at
  `httpTransport.ts:148-158`; it should reuse that PARKED path, still
  owed and out of the sendable queue. *503 is about the SERVER,* not the
  bill and not the network: it refuses every request from every device.
  It should retry like `unavailable` but must NOT feed the per-bill
  poison counter, mirroring what `markSessionExpired` and
  `markSendForbidden` already do at `engine.ts:635-645`. *Wording must be
  DERIVED from the cause with the CALL SITE as a required argument*, per
  `correct-classification-can-still-render-as-an-error.md`, so a new
  member is a compile error rather than an optional carrying the old
  sentence as its default.
  **The mechanism underneath both:** `reachable: true` is one word doing
  two jobs — "the network works" and "the server refuses THIS payload".
  `engine.ts:620-634` already states the rule for 403 in its own words. A
  fix that does not separate those two meanings will produce a fourth
  instance of this class.
  **PROVENANCE, and it bounds everything above.** Every claim here about
  `httpTransport.ts`, `engine.ts`, `fakes.ts` and the proof suite is
  READ FROM SOURCE. No device pass, no Metro bundle, nothing executed on
  the mobile side. The server-side 409 and 503 were observed running
  against scratch; their mobile classification was not. And the defect
  lives in the composition transport -> engine -> queueHealth ->
  statusNotice, which is precisely where
  `lessons/two-green-proofs-do-not-cover-the-seam.md` says it will be and
  where no single proof file owns it. Whoever builds this should know the
  analysis established a SHAPE and observed nothing.
- **`restore_db.py` will FAIL a byte-correct restore the moment migration
  0009 is applied, and two proofs go red with it.** 0009 (committed, and
  this read "NOT YET APPLIED to any cluster" until 2026-08-10 — it was
  **APPLIED TO `recycle` ON 2026-08-09** and is now on four databases)
  creates `directory.shop_codes`, the first
  relation outside schema `public`, and the backup/restore pair is
  asymmetric about schemas in a way nothing else is. Mechanism, end to
  end: `server/scripts/backup_db.py:436-440` invokes `pg_dump` with no
  `--schema` flag, so the body carries a
  `COPY directory.shop_codes ... FROM stdin;` block — pg_dump always
  schema-qualifies these headers, measured on the existing dumps
  (`COPY public.uoms (...) FROM stdin;`). `copy_block_counts`
  (`backup_db.py:329-362`) strips only a `public.` prefix at `:351-352`,
  so the manifest records the key `directory.shop_codes` UNSTRIPPED.
  `restore_db.py:299` reads that manifest as `expected`, `:300-314`
  builds `counts` from schema `public` alone, and `:316` walks
  `set(expected) | set(counts)` — so the directory key is present on one
  side and absent on the other, `want != got`, and `:324` fails a
  restore in which every row landed. **It is a red drawn over a good
  restore, which is the failure mode that teaches an operator to stop
  reading the check.** Blast radius beyond the operator:
  `prove_backup_restore.py:384` gates on `restore_db.py` exiting 0 and
  returns 1 at `:387`; `prove_reconcile.py` `restore_copy()` `:358` goes red
  with `RESTORE_EXIT=none`. Two secondary effects: `backup_db.py:512` sums
  `counts_dump.values()` including directory rows while `:521` reports
  them "across N tables" and `:556` itemises only public tables, so once
  a code exists the summary total stops equalling its own itemisation,
  and `restore_db.py:143` prints the same inflated total. *Not done:*
  0009 records the debt in its docstring and fixes nothing, deliberately
  — a checker change belongs with the reconcile change above, not inside
  a migration. **One inference not measured:** whether `pg_dump` emits a
  `COPY` block for an EMPTY table. If it does, this fires on the first
  backup after 0009 is applied; if not, on the first backup after the
  first code is issued. It fires either way, and the measurement is
  cheap — dump a genuinely empty table and look for the header.
  *Unblocks:* making `copy_block_counts` and the restore-side count
  query agree on schema qualification — either both schema-qualified or
  both stripped — and doing it BEFORE anyone trusts the next backup.
  **AMENDED 2026-08-09 — MEASURED ON A FIXTURE, AND THE INFERENCE ABOVE
  RESOLVED TO THE WORSE BRANCH. Everything above stands; five of its clauses
  now carry numbers instead of reasoning.** The fixture is
  `recycle_tw20260809_0009fixture`, restored from
  `recycle_20260809T045731Z_pre-directory-role` and walked up the real upgrade
  path rather than migrated from 0001. The live database was never written to
  and still reads 0008 with a `directory` schema count of 0. **TRUE OF THAT
  PHASE ONLY: 0009 was applied to `recycle` on 2026-08-09, which now reads 0009
  with a `directory` schema count of 1.**
  *(a) THE "one inference not measured" CLAUSE IS CLOSED, AGAINST US.*
  `pg_dump` DOES write a `COPY` block for an empty table. 12 `COPY` headers in
  the dump at 0008 against 12 user tables, and **13 at 0009 with
  `directory.shop_codes` holding no rows at all** — the header
  `COPY directory.shop_codes (tenant_id, code) FROM stdin;` present with its
  terminator immediately after it. The manifest recorded
  `"directory.shop_codes": 0` and `restore_db.py` exited 1 on a restore in
  which every row landed and the target genuinely held the schema, the table
  and `alembic_version` 0009. **So it fires on the first backup after the
  migration is applied, not on the first code issued.** The window between
  those two, which this entry assumed existed, is zero wide.
  *(b) THE BLAST-RADIUS CLAIM NAMING `prove_reconcile.py` IS CONDITIONAL, and
  the sentence above does not say so.* That red can fire only on a run given
  `--from`: `restore_copy()` has exactly one call site and it sits inside
  `if args.backup:`. **A `--skip-restore` run never calls `restore_db.py` at
  all and is untouched by this defect.** `prove_backup_restore.py` is
  unconditional and that half of the claim is unchanged. Note also that a
  FAILED `restore_db.py` prints no `RESTORE_EXIT` line whatever — `fail()`
  calls `sys.exit(1)` before the print is reached — so `none` above is an
  ABSENCE and not a parse failure, which is now recorded at
  (`CLAUDE.md § Machine footguns` "the attempt comes back EMPTY rather than failing").
  *(c) TWO OBSERVABLES, TWO DIFFERENT TRIGGERS, and only one of them waits for
  data.* The restore red does not wait — it fired at 0009 with the table
  empty. The summary-versus-itemisation disagreement DOES wait for the first
  row: at 0009 empty the summary read `844 rows` over an itemisation of 844,
  in agreement and looking entirely correct; with one code issued it read
  `845 rows`, `MANIFEST.txt` read `Rows      : 845 across 12 tables` over an
  itemisation of 844 in which `shop_codes` appears zero times, and
  `restore_db.py` printed the same inflated `rows in dump   : 845`. **Anyone
  reproducing this by issuing a code first meets both symptoms at once and
  concludes the data was the trigger.** It is one defect with two triggers,
  and the earlier one is the one nobody predicted.
  *(d) THE CITATION `prove_reconcile.py:331` ABOVE WAS WRONG and is corrected
  in place to `restore_copy()` `:358`.* Line 331 is a fragment of the
  `PROVE_RECONCILE OK, WITH SKIPS` message; the `RESTORE_EXIT=none` string is
  at `:358`, inside `restore_copy()`, which begins at `:343`. Re-derived at
  `0aee22e` and not carried from a report. **This is the SECOND rotted
  citation traced to `12d16a2`**, the first being the reconcile public-only
  predicate list that `PROJECT_STATUS.md` already records as re-derived rather
  than copied. One commit, two stale pointers, both reading as authoritative.
  *(e) SCHEMA `directory` HOLDS THREE `pg_class` ROWS, NOT ONE, and this has
  stopped being an observation.* Read from the catalogue on the fixture at
  0009: `shop_codes` at `relkind` `'r'`, plus `shop_codes_pkey` and
  `uq_shop_code` at `relkind` `'i'`. **The next phase gets this number wrong
  immediately if its widened predicate does not filter `relkind`** — widening
  `nspname = 'public'` to "outside `public`" without one enumerates three
  relations where one is meant and reports two indexes as unknown tables,
  which is a different wrong answer in the opposite direction from the one
  this entry is about. There is no existing relkind entry in this file to bind
  that to; it is recorded here, beside the defect that produced it.
  *Still not done, deliberately:* the fix. `copy_block_counts` and the
  restore-side count query still disagree about schema qualification and
  neither was touched. Written up as
  `lessons/a-round-trip-must-agree-on-its-key-space.md`.
  **HALF CLOSED 2026-08-09 in `4150833`. THE RESTORE SIDE IS FIXED; THE BACKUP
  SIDE IS NOT, AND IT IS THREE DEFECTS RATHER THAN THE ONE THIS ENTRY DESCRIBES.**
  Everything above stands as the description of the defect and of how it was
  found; what follows is what changed and what did not.
  *(a) DONE — the restore side.* The comparison in `restore_db.py` now walks the
  manifest's keys and nothing else, so the UNION over two key sets is gone and
  nothing can be compared that the dump did not name. Each key is split into
  (schema, relation) — bare means public, dotted carries its own schema — and
  each part is quoted separately; `quote_ident` and `quote_literal` are the first
  identifier-quoting helpers in this repository, and they live on this side
  because the script has no database driver and a bound parameter is a VALUE
  rather than an identifier. Presence is asked with `to_regclass` before any
  count, so a key naming an absent relation is a named FAIL rather than a psql
  abort. **The two 0009 dumps now exit 0 with `directory.shop_codes` present as
  an OK row carrying a number on BOTH sides**, and a fabricated dump that lost
  that row reads `dump=1  restored=0` and goes red — under the old code it read
  `restored=None` whether the row was there or not, which is to say the table was
  never being checked at all.
  *(b) STILL OPEN — `backup_db.py`, and DELIBERATELY.* Its divergence has no
  repeatable control yet, and fixing both sides against one control means a
  regression could not be attributed to a side. **THREE defects, and they are
  separate problems with separate fixes. THIS READ "TWO" UNTIL 2026-08-09**, when
  a control pass built one relation per identifier shape and measured a third:
    1. **The summary total does not equal its own itemisation.** `:512` sums
       `counts_dump.values()` across every schema while `:556` itemises public
       tables only and `:521` reports them "across N tables" — measured, **845
       against 844**, with `shop_codes` appearing zero times in the list it is
       being counted into. `restore_db.py:143` prints the same inflated total.
       Fires only once a non-public row EXISTS.
    2. **`copy_block_counts` emits a WRONG KEY for any identifier `pg_dump` had
       to quote.** It takes `line.split(" ", 2)[1]`, so
       `COPY directory."Odd Name" (a) FROM stdin;` is keyed as
       **`directory."Odd`** — truncated at the space, quote character retained.
       Measured 2026-08-09 with that function IMPORTED rather than
       reimplemented, so the answer cannot be wrong about the code it reports
       on. This is NOT the schema-qualification defect and is not fixed by
       fixing it; the restore side already handles such a key correctly, and the
       writer cannot yet produce one.
    3. **A quoted identifier in schema `public` makes `live_row_counts` COUNT
       THE WRONG RELATION where a colliding name exists, and abort only where
       one does not. This item said "ABORTS the backup" until 2026-08-09; the
       correction is below and it moves the defect from safe to silent.**
       `live_row_counts`
       interpolates `public.{t}` UNQUOTED, so `public."Odd Name"` yields
       `... count(*) as n from public.Odd Name ...`. Measured 2026-08-09 by
       creating that relation in a scratch database and running the real tool:
       `BACKUP FAILED: psql failed (1): ERROR: relation "public.odd" does not
       exist`, exit 1, and **no `BACKUP_EXIT` line** — `fail()` calls
       `sys.exit(1)` before the print.
       **CORRECTED 2026-08-09 — THE ABORT IS THE LUCKY CASE, NOT THE DEFECT.**
       This entry read "IT FAILS CLOSED, WHICH IS THE SAFE DIRECTION — the
       danger is the MISSING EXIT LINE, not a corrupt backup." **False, and
       false in the dangerous direction.** Unquoted, `from public.Odd Name` is
       VALID SQL naming relation `Odd` — folded to `odd` — with the ALIAS
       `Name`; it errored only because no `odd` existed. **Where one does, the
       statement SUCCEEDS and a count from the WRONG TABLE is recorded**, with
       nothing red anywhere. Measured on `recycle_keyshape_scratch` after adding
       a decoy `public.odd` (11 rows) beside `public."Odd Name"` (13 rows): the
       unquoted code returns `{'Odd Name': 11}`. It fails closed only when the
       collision happens to be absent. The missing `BACKUP_EXIT` line is a real
       hazard and the lesser one.
       **`prove_backup_restore.py` CARRIES THE IDENTICAL UNQUOTED
       INTERPOLATION** in its own `row_counts()` —
       `f"select '{t}' || '=' || count(*)::text from public.{t}"` — so it fails
       the same way on the same input. Established by reading; that file was not
       modified and was not run.
  *Unblocks:* all three, together, against a control that can distinguish them,
  which means a fixture carrying a non-public table AND a quoted identifier.
  **That fixture now exists as a DURABLE database rather than a scratchpad file:
  `recycle_keyshape_scratch`**, at 0009, carrying `directory.shop_codes` plus one
  relation per shape `pg_dump` must quote — upper case, a space, a dot in the
  name, an embedded quote — in schemas `q` and `Q S`. It carries its own DROP
  WHEN condition as a database comment, in the form the 0009 fixture uses.
  **TWO OF THE THREE CLOSED 2026-08-09/10. ONE REMAINS, AND IT IS NOT THE ONE
  THIS ENTRY OPENED WITH.** Everything above stands as written; what follows is
  what landed.
  *Defect 2, the KEY SPACE — CLOSED in `68d679d`.* `copy_block_counts` now
  tokenises a COPY header with quotes respected and writes the LOGICAL relation
  name, so the key for a quoted identifier is correct and the reader's
  `split_key` resolves it. The format did NOT change — bare for public,
  `schema.relation` otherwise — so every manifest already in the backup root
  still restores; measured green across five artefacts at 0003, 0006, 0007,
  0008 and 0009. Verified end to end on the fixture: 22 relations, 22 keys, 22
  comparison rows, source count and manifest count and restored count agreeing
  for every one.
  *Defect 3, the UNQUOTED INTERPOLATION — CLOSED in `cf2dadf`*, together with
  the same repair in `restore_db.py` (`89d55ce`). **And its description in this
  entry was WRONG until that commit**: it said the backup fails closed. It does
  not — see the correction inside item 3 above.
  *STILL OPEN, AND IT IS DEFECT 1 ONLY:* the summary total against its own
  itemisation. `:512` sums `counts_dump.values()` across every schema while
  `:556` itemises public tables alone — 845 against 844 when measured. Nothing
  in these commits touched it. **The count in this entry and in the queue below
  now reads ONE remaining, not three.**
- **A BACKUP DIRECTORY'S LABEL NAMES WHAT THE BACKUP IS ABOUT, NOT WHAT IT
  CONTAINS, AND ONE ALREADY LIES — FOUND 2026-08-09 while looking for a copy to
  point `prove_reconcile.py` at.** `backup_db.py` writes
  `recycle_<timestamp>[_label]`, and the label is free text supplied by whoever
  took it. **`recycle_20260808T074116Z_clock-guard` reads as the clock-guard
  state and its dump is at 0007** — and 0008 IS the clock-watermark migration, so
  the label names precisely the thing that copy does not have. Read out of the
  artefact, `COPY public.alembic_version` in each `recycle.sql`, never off the
  name: 0003, 0003, 0004, 0006, 0007, 0007, **0007** and 0008 across the eight
  directories. **Exactly ONE is at 0008**
  (`recycle_20260809T045731Z_pre-directory-role`), and it is the only copy any
  proof requiring the current schema can be pointed at.
  **Why it is worse than untidy.** The failure it produces is not an error: a
  copy restored from a dump older than the schema a checker requires goes RED for
  its AGE, which this list already records two entries above as inherent to
  restoring arbitrary dumps — so the operator meets a red that looks like a money
  defect and is a fixture defect. And the 07:00 path in `server/scripts/BACKUP.md`
  has an operator choosing a directory under time pressure, by name, with the
  dumps' actual contents one grep away and nobody grepping. *Not done:* renaming
  the existing directories would destroy the only record of when each was taken
  and is not obviously right; `MANIFEST.json` already records the source database
  and the instant but **not the migration version**, which is the field that would
  have answered this without opening the dump. *Unblocks:* deciding between two
  fixes that are not the same — record `alembic_version` in `MANIFEST.json` at
  backup time so the artefact states its own schema, or have `restore_db.py`
  print the dump's version prominently before it starts. The first is the honest
  one; the second helps only whoever already ran the restore.
- **`restore_db.py` HAS NO COMPARISON-ONLY MODE, so testing the comparison means
  fabricating a dump that disagrees with its own manifest — FOUND 2026-08-09, and
  recorded because the next person to test it will otherwise spend the same hour
  discovering it.** Its argparse declares exactly five arguments — `backup_dir`,
  `--into`, `--container`, `--with-globals`, `--overwrite-live` — and `:262`
  `DROP DATABASE IF EXISTS … WITH (FORCE)` then `:267` `CREATE DATABASE` before
  the comparison at the end of the run. **So a row deleted from a restored copy is
  destroyed by the very run that would notice it**, and "run the comparison, break
  something, run it again" cannot be done. *The method that works, which is what
  this entry is for:* copy a dump directory somewhere outside the backup root,
  remove rows from ONE `COPY` block in the body, update
  `MANIFEST["files"][body]["sha256"]` and `["bytes"]` so the integrity gate is not
  what fires, and leave `row_counts_in_dump` alone — the disagreement between body
  and manifest IS the injection. Verified both ways this phase: a public key gave
  green / `dump=24 restored=20` / green with the database read back at each beat
  (24, 20, 24), and a dotted key gave `dump=1 restored=0`. *Not done:* nothing;
  this is a note, not a debt. *Unblocks:* anyone asked to prove a change to that
  comparison.
- **`prove_backup_restore.py` WRITES A PERMANENT BILL TO THE LIVE DATABASE ON
  EVERY RUN, and has no flag to point it elsewhere — so it cannot be run under any
  brief that forbids live writes.** Measured 2026-08-09 by reading it: no
  `argparse`, no `ArgumentParser`, no `sys.argv`, no `--database` — zero matches.
  It derives `live_db` from `APP_DATABASE_URL` (`:282`) and inserts a marker bill
  at `:364`. It VOIDS the marker afterwards rather than deleting it, correctly,
  because hard rule 5 forbids the delete — **and that is exactly why the write is
  permanent**: the bill stays, and the `doc_no` it consumed from the live gap-free
  counter is never reissued. Every run costs one. **This bounds who may ever be
  told to run it**: it is not a check that can be demanded by a phase whose ground
  rules include "do not write to the live database", and one such phase has
  already had to decline it. *Not done:* it takes no `--database`. *Unblocks:*
  either a flag, or an explicit standing statement that this proof is only ever
  run against live and with the owner's knowledge that it spends a doc_no.
  **CLOSED IN M4 c2 — 2026-08-29 (`320d8ee`).** It takes a
  scratch source now: live is DUMPED read-only, restored into scratch-SOURCE, and
  the marker plus counter bump land there — live is never written. The end cell
  proves live `purchase_bills` and the `doc_no` counter are identical before and
  after (576->576, 563->563, cross-checked independently outside the proof). Green
  TWICE; the vacuity guard is unchanged in kind — the pre-marker dump of
  scratch-SOURCE becomes scratch-TARGET, so the marker is present in SOURCE and
  absent in TARGET in one run. The retired per-run cost and its date are recorded
  in the script header.
- **`prove_backup_restore.py`'s OWN comparison is NARROWER than the one inside the
  script it exercises, so a table the child would flag passes the parent
  silently.** Measured 2026-08-09 by reading it, and it exists today rather than
  being created by any change: `:292` sets `tables = table_names(live_db)` — the
  LIVE SOURCE's catalogue — and `:392-393` iterates `for t in tables` when
  comparing `in_dump` against `counts_restored`. So the comparison is bounded by
  what the source happens to hold, not by what the manifest CLAIMS. A key present
  in the manifest and absent from the source's public catalogue is never compared
  at all — which is precisely the class of failure the child was just changed to
  catch. **The proof is therefore weaker than the thing it proves.** *Not done:*
  nothing was touched; the file was read, not modified. *Unblocks:* making that
  loop walk the manifest's keys, the same change that just landed one level down.
- **THE NEXT THREE PIECES OF WORK ON THE BACKUP/RESTORE ARC, IN THE ORDER THE
  OWNER GAVE THEM ON 2026-08-09 — and the order is recorded here under protest of
  this file's own contract.** `OPEN_ITEMS.md` says of itself at its head: "This is
  a LIST, not a tracker. There are no priorities and no dates here", and that
  `ROADMAP.md` ranks the subset on the critical path and argues the order.
  `CLAUDE.md` says the same split. **There was no ordered not-yet-scheduled
  section to bind this to, because by design there is none.** The sequence is
  written down here so it is not lost with a chat session; it is NOT an R-number,
  none was invented, and issuing one is the owner's act in `ROADMAP.md`.
  1. **`backup_db.py`'s ONE REMAINING defect** — the summary total against its
     own itemisation, `:512` summing across every schema while `:556` itemises
     public tables alone. Described in full in the entry above; not restated
     here, because two copies drift. **This said TWO on 2026-08-09, then THREE
     when a control pass measured a third, and now ONE**: `cf2dadf` closed the
     unquoted interpolation and `68d679d` closed the key space. The count has
     moved three times, which is why it is written here with its history
     attached rather than as a bare number.
  2. **The dev cluster to 0009. DONE 2026-08-09 — and the ordering note below
     was followed rather than overtaken.** The text as written: "`recycle` still
     reads 0008 with a `directory` schema count of 0, re-measured 2026-08-09.
     0009 has been applied only to throwaways and to
     `recycle_tw20260809_0009fixture`, which survives under a stated DROP WHEN
     condition. Doing this BEFORE (1) means the first backup afterwards is the
     one that meets the unfixed writer."
     **What actually happened is the safer order**: item (1)'s first two thirds
     landed FIRST — `cf2dadf` and `68d679d` — and 0009 was applied after, so the
     first backup taken afterwards met a FIXED writer and a fixed reader. It
     came back green with `directory.shop_codes` as an OK row, which on the
     parent code was the red that started this work. `recycle` now reads 0009,
     `directory` count 1, proven by a cluster-wide before/after differential
     rather than by an exit code.
     **WHAT THIS UNBLOCKS, and what it does not.** Item 3 below moves from
     unprovable to provable: a widened reconcile predicate now has a real
     relation outside schema `public` to enumerate on the live database, so its
     green would no longer be green over an empty set. **P1.3 is NOT unblocked
     into done** — the schema half is what landed. This read "the step is
     finished by a login carrying no uuid returning 200, and the server change
     is not written. Nothing reads or writes `directory.shop_codes`" until
     2026-08-10, and **all three clauses have moved**: that DONE WHEN was
     rewritten (see P1.3, which carries the reason and the old wording), the
     server change LANDED in `1951b19`, and `POST /auth/shop-code` now READS
     that relation. **NOTHING WRITES TO IT, which is the half that did not
     move**, and who issues a code when a shop is onboarded is still undecided.
     *Ranking is `ROADMAP.md`'s; nothing is reordered here.*
  3. **The reconcile predicate widening.** Bounded to schema `public` at seven
     sites, so a relation in `directory` is invisible to it; the limit is the
     PREDICATE and not the exclusion lists, so adding a name to a `NOT IN`
     changes no result. **CARRY THIS NUMBER FORWARD, because it is the one a
     widened predicate gets wrong immediately: schema `directory` holds THREE
     `pg_class` rows, not one.** Read from the catalogue on the fixture at 0009:
     `shop_codes` at relkind `'r'`, plus `shop_codes_pkey` and `uq_shop_code` at
     relkind `'i'`. A predicate widened from `nspname = 'public'` to "outside
     `public`" WITHOUT a relkind filter enumerates three relations where one is
     meant and reports two indexes as unknown tables — a wrong answer in the
     opposite direction from the defect this arc was about.
  *Unblocks:* the owner deciding whether any of the three is an R-number, which
  is the only place an order becomes binding.
- **`PROJECT_STATUS.md`'s PHASE ROTATION IS OWED — its § Current phase names the
  2026-08-09 backup/restore work at the top and then carries roughly 360 lines of
  the SUPERSEDED `GET /users` phase underneath it.** That file's convention is a
  rotation: the old § Current phase becomes § Previous phase, and the old
  § Previous phase (A2, reconciliation, ~240 lines) joins § Earlier phases.
  *Not done:* the rotation moves roughly 600 lines, and doing it inside a commit
  whose subject is a backup/restore defect would produce a diff nobody could
  review against that subject — the superseded material is therefore marked in
  place, at the paragraph where it begins, rather than moved or deleted. Nothing
  was destroyed and nothing was silently left looking current. *Unblocks:* a
  change whose only subject is that move, so the diff is a move and reads as one.
- **`recycle_keyshape_scratch` IS THE ONLY INSTRUMENT IN THIS PROJECT THAT CAN
  DETECT THE KEY-SPACE DEFECT, AND DROPPING IT WOULD LEAVE AN ACCEPTANCE
  CRITERION THAT IS GREEN FOREVER WITH NOTHING BEHIND IT — MEASURED 2026-08-10,
  not reasoned.** The key parser was deliberately mutated back to its old
  space-splitting behaviour and all three acceptance runs were repeated. The
  identifier-shape fixture went **RED**, naming the relation:
  `BACKUP FAILED: tables with no COPY block in the dump at all: ['Odd Name']`.
  **The other two stayed GREEN, exit 0 each**: the ordinary-backup check, whose
  database has no name needing quotes, and the old-manifest restores, which read
  manifests written before that parser existed and never invoke it. So of the
  three checks that look like they cover this repair, exactly one does.
  **What follows, and it is the reason this is filed rather than remembered:** if
  that database is dropped, nothing on this box reproduces the defect, and the
  remaining checks continue to pass. A future session would inherit a green suite
  over a repair it cannot test, which is indistinguishable from a working one.
  The fixture carries its own DROP WHEN as a database comment for this reason.
  *Not done:* nothing is owed while the fixture exists. *Unblocks:* whoever
  eventually deletes it must first make the shapes reproducible from a script, so
  the instrument survives the database.
  **AMENDED 2026-08-10 — A SECOND THING NOW WRITES TO THIS DATABASE, and whoever
  maintains the instrument should know before they are surprised by it.**
  `server/scripts/prove_shop_code.py` uses it as its `--directory-database` and
  DELETEs then INSERTs a fixture row in `directory.shop_codes` on every run.
  **The instrument is believed unharmed**, because what it measures is
  identifier SHAPES — relation names carrying a space or a dot — and rows inside
  `shop_codes` are not part of that. This read "**BELIEVED, NOT MEASURED:** this
  database held one `shop_codes` row before that proof first ran, the proof's
  DELETE clause would have removed it if it named tenant A, and the phase
  recording this was forbidden to touch any database, so whether a pre-existing
  row was displaced is UNKNOWN" until 2026-08-10.
  **MEASURED NOW, AND THE ROW WAS DISPLACED.** `directory.shop_codes` in that
  database holds exactly one row and it is this proof's fixture
  (tenant A, `ZZ9TEST4`). Established by pairing two readings rather than by one:
  the survey taken BEFORE the proof first ran counted one row there, and
  `ZZ9TEST4` is a code the proof invented — so the row that was there is gone,
  and since the DELETE clause only removes a row matching that code OR tenant A,
  the displaced row named tenant A. **The honest word is displaced, not
  harmless.** *Not done:* re-point that proof at a database with no other job, so
  a fixture and an instrument stop sharing one home. *Unblocks:* an instrument
  whose contents only one thing depends on.

- **THE KEY-SPACE INSTRUMENT ITSELF WAS MEASURED INTACT, BEFORE AND AFTER, WITH
  THE SAME TOOL BOTH TIMES — and this is a DIFFERENT QUESTION from the displaced
  row above.** One is about the instrument; the other is about a row the
  instrument does not look at, and collapsing them into a single reassuring
  sentence is how a real loss gets filed as a non-event. Measured 2026-08-10
  around `b22d449`: `backup_db.py --db recycle_keyshape_scratch` — the EXISTING
  tool, identified as the source of the failure text this section quotes, rather
  than a new one, because two instruments measuring one property is how two
  disagreeing numbers get born. `BACKUP_EXIT=0` both times, 15 tables, identical
  per-table counts including the decoy pair `Odd Name`=13 against `odd`=11, and
  an identical manifest total of 3 files, 222995 bytes, 913 rows. "Intact" was
  defined FIRST as a query — six relations whose names need quoting, a schema
  whose name needs quoting, and the lowercase decoy — so the AFTER reading was
  compared against a stated expectation rather than against an impression.
  *Not done:* nothing is owed; this is a recorded measurement, kept because the
  next person to write into that database will want to know it was checked and
  how. *Unblocks:* nothing.

- **DOES THE AUTHENTICATED ENDPOINT'S REFUSING HALF BELONG IN CRITERION A, OR
  STAY AS EXTRA RIGOUR IN THE PROOF? THE OWNER'S TO DECIDE.** P1.3's Criterion A
  requires that the token be USED against an endpoint requiring authentication
  and that the request succeed. It does NOT require the negative half. The proof
  asserts it anyway — A5 sends the same endpoint no token and a tampered token,
  gets 401 for both, and records that the two refusals do not differ — on the
  ground that a positive with no paired negative in the same run is not readable.
  **So the proof is currently stricter than the criterion it satisfies**, which
  is a good direction to be wrong in but should not stay unremarked: a later
  reader comparing the two will otherwise think one of them is a mistake. *Not
  done:* undecided. *Unblocks:* either one sentence added to Criterion A, or a
  note in the proof saying A5 is deliberate surplus. Not this session's call —
  a criterion is the owner's.
- **THE MANIFEST KEY FORMAT CANNOT REPRESENT TWO IDENTIFIER SHAPES, AND THEY FAIL
  BY COLLIDING WITH A LEGITIMATE KEY RATHER THAN BY FAILING TO PARSE.** The
  reader partitions on the FIRST dot, so a dot inside a relation name in a
  NON-public schema is fine — `q` + `a.b` → `q.a.b` → `(q, a.b)`, measured
  round-tripping. The two that are not:
  a dot inside a **public** relation's name (key is the bare `a.b`, read as
  schema `a`, relation `b`), and a dot inside a **schema** name (`x.y` + `t` →
  `x.y.t`, read as `(x, y.t)`).
  **Neither raises anything.** Each produces a key that is well-formed and means
  a different relation, so no check can separate the two readings and no error
  appears at any point. That is why this is filed as a limit rather than a bug:
  it is ambiguous, not detectably wrong. *Not done:* fixing it needs a manifest
  FORMAT change — a version marker or a different key shape — which this project
  has deliberately not taken on. *Unblocks:* that decision. No database on this
  box and no manifest in the backup root carries such a name today.
- **RESTORING A DATABASE'S OWN BACKUP INTO THE DEFAULT TARGET TRIPS THE
  OVERWRITE-LIVE GATE, and the next person will meet it.** `restore_db.py`'s gate
  fires when `--into` names the database the backup came FROM and that database
  exists. Backing up `recycle_restore_scratch` and then restoring that dump
  without `--into` satisfies both conditions, because the default target IS the
  source — so a harmless verification of a scratch backup is refused as "a
  destructive overwrite of live data". The gate is correct; the surprise is that
  the default target is also the most convenient thing to back up.
  *Recorded because of what it cost:* a temporary database
  `recycle_keyspace_check` had to be created to receive that restore, and the
  brief that required it forbade dropping databases, so it survived a commit
  before a later brief authorised removing it. It held a 0008 copy, 12 user
  tables, 385 bills, and was dropped 2026-08-10 — cluster `recycle%` count 10 →
  9, verified by naming all ten and reporting which was absent. *Not done:*
  nothing; this is a note. *Unblocks:* anyone verifying a backup of the scratch
  database, who needs to know to pass `--into` something else.
- **A READ-ONLY COMMAND WAS REFUSED BY THE PERMISSION CLASSIFIER FOR A REASON NO
  FILE WE HAVE READ EXPLAINS — 2026-08-09, recorded as unexplained because that
  is what it is.** Immediately after applying 0009, a `docker exec … psql -f
  /tmp/versions_snapshot.sql` reading `alembic_version` from every database was
  denied: *"Permission for this action was denied by the Claude Code auto mode
  classifier."* **The identical command had been PERMITTED minutes earlier** to
  take the before-snapshot; the only difference was an output redirect to a
  scratchpad file. The same query without the redirect was then permitted and
  returned the same kind of data.
  *It was NOT routed around.* An equivalent read was run instead — the natural
  alternative the refusal text itself suggests — and the refusal is reported
  rather than absorbed. **Why this is filed and not shrugged at:** the command
  was read-only, it was part of proving that a migration had reached the
  database it was meant to reach, and a refusal arriving at exactly that moment
  is the kind of thing that, taken as noise, leaves an unproven claim in a
  status file. Nothing in `.claude/settings.json`, the hooks, or any document in
  this repository accounts for it, and no hook fired — `pipe_gate.py` refuses
  with its own text and this was not that.
  *Not done:* nothing is understood. *Unblocks:* knowing whether the trigger is
  the redirect, the file path, non-determinism, or something outside this
  repository entirely — a settings file none of us has surveyed. Until then,
  treat an unexplained refusal as a finding to report, never as a reason to
  reach for a different spelling until one works.

- **A LESSON THAT CLOSED 403 READS AS THOUGH IT CLOSED THE WHOLE CLASS, AND
  THREE STATUSES ARE STILL OPEN.**
  `lessons/403-is-about-what-the-caller-may-do.md` is accurate in every
  sentence: a void refused with 403 is stamped `void_refused_at`, leaves
  `listVoidsToApply`, and is never retried again. What it does not say is that
  the identical hazard remains for every other definitive refusal. Measured at
  `16a1938`: the transport maps 404, 400 and 422 on the void path to
  `rejected`, the engine answers with `markVoidAttemptFailed`, and that touches
  only `void_attempts` and `void_last_error` — neither of which appears in
  `listVoidsToApply`'s predicate. That path has no backoff column, so a void the
  server has refused for good is re-POSTed on every pass, indefinitely. The
  shape of this defect matters more than its content: nothing here is false, and
  a true statement that covers less than it appears to is more dangerous than a
  false one, because a false statement gets contradicted and a narrow true one
  does not.
  *Not done:* nothing — no code has been changed for 404, 400 or 422 on the void
  path.
  *Unblocks:* ~~an owner filter on the void queue, which lands on the same
  predicate.~~ **CORRECTED 2026-08-12 — THAT FILTER IS BUILT, and only this field
  changes; everything above it is still true and is untouched.** `cfb6633` put
  the owner into `listVoidsToApply`'s OWN predicate —
  `AND void_requested_by_tenant_id = ? AND void_requested_by_user_id = ?`, bound
  by `ownerParams(await this.currentOwner())` — **read out of
  `mobile/src/adapters/sqlite/SqliteLocalStore.ts` in this pass, not out of a
  commit message.** So this entry waits on nothing and is not a dependency of
  anything: the 404/400/422 hazard its body describes is unchanged, still open,
  and is now the WHOLE of what this entry is. *Unblocks:* nothing.
- **A LOGIN THAT ANSWERS 200 WITHOUT A TOKEN PUTS THE APP INTO A SIGNED-IN
  STATE WITH NO TOKEN.** Measured at `7b4f22d`: the login transport asserts the
  response shape with `as` rather than checking it, and nothing anywhere
  verifies that the access token is present. A 200 carrying any other body
  returns `undefined`, sign-in takes the SUCCESS path, `undefined` is written to
  the keystore, and the strip reports that the operator is signed in. The person
  at the scale then weighs and pays out cash against a session that cannot send
  a single bill, and finds out only after the money has left the drawer.
  *Not done:* nothing.
  *Unblocks:* nothing — it is a correctness fix on the path P1.7 rewrites.
- **EVERY NON-2XX LOGIN RESPONSE REACHES ONE BRANCH, SO A REFUSAL IS SHOWN AS AN
  OUTAGE.** Measured at `7b4f22d`: the transport throws one error type for every
  non-2xx status and sign-in catches it without reading the status, marking the
  app offline and showing one message. A wrong password, a locked account, a
  tripped clock guard and a server fault are one code path distinguished only by
  digits inside a string. The discriminator for this already exists and is
  imported into that same file; it is called only from the master-data refresh.
  *Not done:* nothing.
  *Unblocks:* P1.7's requirement that a wrong password be distinguishable from
  an unreachable server.
- **A CONTROL THAT ASSERTS TWO VALUES DIFFER CAN BE SATISFIED WITHOUT MEASURING
  ANYTHING, AND BOTH MECHANISMS HAVE NOW BEEN SEEN HERE.** A check written as
  "these two results must not be equal" reads like a control and is not one: it
  passes on any pair that happens to be unequal, including pairs that are
  unequal because the code is wrong. It ends as a check that does not check,
  which is this repository's oldest failure shape, and it is worse than a
  missing check because it is counted as evidence.
  **(1) A WRONG NON-NULL VALUE PASSES IT.** Written in the owner-stamp commit
  that precedes this one: a case required the bill row read back with an
  identity signed in to DIFFER from the same row read back with none. Under a
  deliberate mutation that wrote the tenant into the user column, the row was
  wrong in exactly the way the case existed to catch — and the difference check
  stayed **GREEN**, because a wrong non-null value still differs from null. What
  caught it was a second check requiring the difference to run the right way
  round: one side owned, the other unowned.
  **(2) THE TYPE CHECKER DECIDES IT BEFORE IT EVER RUNS.** In this commit's
  predecessor, a control asserting two identity constants genuinely differ would
  not compile: `const` narrows each string to its own literal type, so
  `TENANT_A !== TENANT_B` is a comparison between types with no overlap and
  TypeScript rejects it as **TS2367**. The obvious repair — delete the check, it
  is "obviously true" — removes the only thing standing between the case and a
  fixture whose two identities are the same value, which every other assertion
  in that case would pass.
  **THE TWO FIXES, NAMED, because each addresses one mechanism and neither
  addresses both.** Assert the DIRECTION of the difference, not its existence.
  And widen the constants with an explicit `: string` annotation so the
  comparison survives to runtime as a measurement instead of being settled at
  compile time — an annotation that looks like noise and is load-bearing.
  *Not done:* no sweep has been made of existing proofs for difference-checks
  that assert no direction; the two instances above were found by mutating the
  code, not by looking.
  *Unblocks:* nothing. It is a rule about how controls are written, and it
  applies to every proof in the tree.
- **A PROOF THAT BUILDS ITS OWN STORE OUTSIDE THE HARNESS IS NOT SIGNED IN, AND
  A STRICT OWNER FILTER READS TO IT AS A GATE STUCK SHUT.** Added in the commit
  that introduced the send-queue owner filter, and it happened to this
  repository's own suite within the first hour of that filter existing.
  `prove:clock` builds its `InMemoryStore` in its own `rig()` helper rather than
  through `harness.ts`, so nothing seeded a device identity into it. Its bills
  were owned; its device was not signed in; the filter therefore selected
  nothing, and the case output read `attempted=0`, `backoff=0ms`,
  `serverErrorAttempts=undefined` — nine failures whose plain reading is that
  the clock gate never opens.
  **THE MISDIAGNOSIS SHAPE, WHICH IS THE REASON THIS IS WRITTEN DOWN.** The
  filter can now make a CORRECT MECHANISM LOOK BROKEN, anywhere. Every symptom
  it produces — nothing selected, nothing attempted, nothing sent — is
  indistinguishable by eye from a gate that is genuinely stuck, a backoff that
  never elapses, or an engine that has stopped. The accusation lands on the
  mechanism under test, which is the expensive direction: the reading is taken
  as evidence about code that is innocent, and every inspection of it comes back
  clean.
  **WHAT DISTINGUISHES THE TWO IS NOT THE GATE. IT IS WHETHER AN IDENTITY
  EXISTS.** Before debugging any "nothing was selected" result, read the
  identity — `SqliteIdentityStore.load()`, or the fake's own identity — and read
  the row's owner columns. If the device has no identity, or the row's owner does
  not match it, the queue is behaving exactly as designed and the mechanism under
  test has not been exercised at all. Only once the identity is present and
  matching does an empty selection say anything about the gate.
  *Not done:* no sweep has been made for other proofs that construct a store
  outside the harness; `prove:clock` was found by running the suite, not by
  looking. The two harnesses and the 31 store-open sites are seeded, and
  `prove:clock`'s rig now is too.
  *Unblocks:* nothing — it is a debugging rule, and it applies to every proof
  that touches the send queue from here on.
- **THE SWEEP THE ENTRY ABOVE ASKED FOR HAS NOW BEEN RUN, AND IT FOUND NOTHING
  FURTHER. THIRTEEN PROOF FILES BUILD A STORE OUTSIDE THE SHARED HARNESS AND
  EVERY ONE OF THEM ESTABLISHES A DEVICE IDENTITY.** Recorded because a zero
  nobody wrote down is a zero nobody can trust later — the next session would
  have no way to tell "swept and clean" from "never looked".
  **THE SEARCHES, NAMED, so the result can be re-derived rather than believed.**
  `rg -n "new InMemoryStore\(" mobile/src mobile/App.tsx mobile/app` returns 3
  hits — two in `harness.ts` (the harness itself) and `proveClock.ts:124`.
  `rg -n "SqliteLocalStore\.open\(" mobile/src mobile/App.tsx` returns 35 — one
  in `harness.ts`, one in `App.tsx` (production), and 33 across twelve proof
  files. **CONTROL:** the first search was shown finding `proveClock.ts`, the
  case already known to have had this defect, BEFORE its silence about any other
  file was believed.
  **THE TWELVE, and how each is covered.** `claimWorker` 1, `proveCart` 2,
  `proveCold` 5, `proveForbidden` 5, `proveNotice` 1, `proveSeller` 1,
  `proveSignOut` 5, `proveVoid` 6, `sqliteProof` 4, `voidCrashChild` 1 — 31
  sites, each paired with a `signInProofDevice` call, counts matching per file.
  `proveOwner` and `proveSendOwner` manage their own identities deliberately and
  are the two that MUST be able to reach the no-identity state, since that state
  is their subject. `proveClock` seeds its own rig with `setIdentity`.
  *Not done:* nothing outstanding. The sweep covers files that build a
  **LocalStore**; proofs that open only a draft or master store were not
  enumerated, because neither reads the send queue and the filter cannot reach
  them.
  *Unblocks:* nothing. It closes the *Not done* clause of the entry above.
- **A PROOF THAT REQUESTS A VOID BEFORE THE OTHER BILLS ARE SYNCED NOW EARNS A
  PERMANENT REFUSAL, AND THE ROW LEAVES THE VOID QUEUE FOR GOOD.** New with the
  commit that made a rejected void stop being re-sent; this entry is added by
  the commit after it, which is where it bit.
  **THE MECHANISM, WHICH IS NOT OBVIOUS FROM EITHER END.** A proof helper that
  syncs a bill typically builds a real `SyncEngine` and calls
  `runUntilQuiescent`, and that runs the VOID loop as well as the send loop —
  against whatever transport the helper happens to construct, usually a fresh
  `FakeServer`. That server has never heard of any OTHER bill, so it answers
  `not_found` for a void already sitting on one; `toVoidOutcome` maps that to
  `rejected`; and the engine now marks it PERMANENTLY REFUSED. Nothing is
  wrong with the filter, the engine, or the void. The proof's own setup did it,
  one helper call earlier, to rows it was about to test.
  **THE SYMPTOM IS ALL-ZERO COUNTS, AND IT READS AS TWO THINGS IT IS NOT.**
  Every void attempt count comes back 0 and the queue comes back empty, which
  is exactly what an over-strict owner filter looks like, and exactly what an
  engine that has stopped looks like. Both readings send the reader into code
  that is correct. It is the same family as the entry above about a store built
  outside the harness — an innocent mechanism wearing the symptoms of a broken
  one — and it is worse here, because the poisoning happens in the SETUP and is
  therefore invisible in the part of the case anybody reads.
  **WHAT DISTINGUISHES IT: READ THE REFUSAL COLUMN ON THE ROW BEFORE CONCLUDING
  ANYTHING ABOUT OWNERSHIP OR THE QUEUE.** `void_refused_at` non-null, with
  `void_refused_code` = `void_rejected`, means the void was permanently refused
  and ownership never came into it. Null there with a mismatched
  `void_requested_by_*` is the ownership exclusion. Empty counts alone
  distinguish neither, and neither does an empty queue.
  **FOUND BY A PROOF FAILING, NOT BY ANYONE LOOKING.** `prove:voidowner`'s W1
  went red with every count at zero on its first run, and the cause was read out
  of the row dump it happened to print. It was fixed there by creating every
  bill before any void is requested, with the reason written at that line.
  *Not done:* NO SWEEP has been made for other proofs whose helpers sync a bill
  after a void has been requested. Only the one case that failed is known to be
  ordered safely; the rest are unexamined, and a proof that has never had a void
  outstanding during a sync call would show no symptom today and acquire one the
  moment a case is added.
  *Unblocks:* nothing — it is a debugging rule and an ordering constraint on
  proof setup, and it applies to every proof that touches the void queue.

- **TWO KINDS OF ROW CAN NOW NEVER BE RELEASED, AND NEITHER IS A DEFECT — THEY
  ARE WHAT THE DECIDED RULES PRODUCE. Measured at `fde2b0c`.** Both follow from
  "an owner this device cannot match is not mine", which is deliberate, and both
  end in the same place: a row that waits for a person who will never arrive.
  **(1) A BILL OWNED BY SOMEBODY WHO HAS LEFT.** `QUEUED` selects only rows whose
  owner pair equals the stored identity, so an unsent bill written by an employee
  who never signs in on this handset again is owed for ever and sends never. The
  cash left the drawer; the server has no record; the bill exists on one device.
  `ROADMAP.md § P1.7` states this outcome as certain rather than possible —
  "keying ownership to a user means an employee who leaves with unsent bills
  leaves them unsent for good" — and says the way out must be deliberate and does
  not exist yet.
  **(2) A DRAFT WHOSE OWNER IS UNKNOWN.** Since `fde2b0c` the loader hands back
  only the current person's cart and counts the rest as withheld. A different
  owner is released when that person signs in here; a NULL owner is released by
  nobody, because null matches no identity — so a cart written before the columns
  existed, or in the boot window before the identity store opened, is kept for
  ever and shown to nobody.
  **WHY THEY ARE ONE ENTRY.** Same cause, same absence of a remedy, and the same
  trap for whoever writes one: a fix aimed at either that works by ATTACHING the
  present user solves it by manufacturing provenance, which is the exact failure
  the owner pair exists to prevent and which no later audit could detect. Any
  remedy must move the row to a state that says NOBODY KNOWS rather than to a
  state that names somebody.
  **WHAT IS VISIBLE TODAY, and it differs between them.** The draft half is
  surfaced — a count on the start screen, wording that says the work was kept and
  its owner unchanged. The bill half is NOT: the count the operator reads is the
  unfiltered `listByState` total, so an unreleasable bill is inside a number that
  looks like an ordinary backlog. That half is P1.7 step 7's to fix, and it is
  named in the current-phase entry of `PROJECT_STATUS.md`.
  *Not done:* disposal is UNDECIDED for both — whether such a row is ever
  discarded, after how long, on whose authority, and what evidence survives it.
  No count of affected rows on any real handset exists or can exist
  (`ARCHITECTURE.md § 11`), so the size of this is unknown and will stay unknown;
  no number is quoted here for that reason.
  *Unblocks:* an owner decision. Until it is taken the rows accumulate silently,
  which is the correct behaviour and is also the reason nobody will notice them.

- **`POST /bills` CLASSIFIES AN UNRESOLVABLE `seller_id` AS PERMANENT, ON AN
  ARGUMENT THAT OFFLINE SELLER CREATION FALSIFIES — AND THE ARGUMENT IS WRITTEN
  DOWN BESIDE IT.** Raised 2026-08-23 by the seller-kind design, which decided
  around it rather than changing it, because `server/` is out of that phase's
  bounds. NOTHING BELOW IS AUTHORISED.

  **The mechanism, re-derived in that pass.** The route reads the seller row and,
  where it is absent, raises **422** — not the resolvable 424 it raises when the
  seller exists but has no grade. The header comment above the route states the
  reason in its own words: a reference that does not resolve at all stays
  permanent because *the device got those ids from this tenant's own /sellers and
  /products, so a miss means a corrupt or stale reference, not a setup gap.*
  **That premise is exactly what P1.8b removes.** After it, a device legitimately
  holds seller ids the server has never seen, and a bill naming one is valid a few
  seconds early rather than corrupt.

  **WHAT IT WOULD COST IF NOTHING CHANGED:** the first offline walk-in produces a
  TERMINALLY FAILED bill for cash already paid, on a row hard rule 5 forbids
  deleting — which is the failure the resolvable class was split out to prevent,
  arriving through the one reference the split deliberately left permanent.

  **THE DESIGN DOES NOT ASK FOR THE RULE TO CHANGE, and that is the finding
  rather than a softening.** It parks such a bill on the DEVICE, so the request is
  never sent and the server's 422 stays correct for what it was written for — a
  genuinely corrupt reference. So this entry is not "fix the server"; it is that
  **a comment in `server/app/bills.py` states a premise which stops being true the
  day P1.8b ships, and nothing anywhere compares the two.** A wrong argument
  beside a right rule is the shape this repository has recorded before: it does
  not fail, it does not compile red, and it steers whoever reads it next.

  *Contradicts:* that route's stated reason for the permanent class, against the
  device holding server-unknown seller ids after P1.8b. *Not done:* the comment is
  unedited and the classification is unchanged, both deliberately — the design
  phase could touch neither. *Unblocks:* nothing built. It removes a premise a
  later reader would otherwise rely on, and it is the sentence to re-read before
  anyone reconsiders where a device-parked bill should live.

## Decisions open — the owner's, not the code's

- **P1.8b HAS NO DONE WHEN, SO NOTHING CAN SAY WHEN THE OFFLINE HALF IS FINISHED.**
  Raised 2026-08-25 by P1.8b GATES while re-deriving the step's closure at the
  phase boundary. MEASURED: `grep -n "DONE WHEN"` over `### P1.8`'s body returns
  three lines — the step's own criterion, the sentence recording that P1.8a met
  it, and a mention of the P1.18 planning step's — and no fourth. The split of
  2026-08-17 assigned the one criterion to P1.8a in its own words, because it
  *says nothing about offline*, and left P1.8b with a STATUS and no criterion.
  So three phases of offline work have landed against nothing that can say when
  they are finished, and the criteria set is doing a job it was not written for
  — it measures DECISIONS, not the step's closure. THE DECISION is whether P1.8b
  gets a DONE WHEN of its own and what it names; minting one inside a phase that
  would then be measured by it is the one thing a building phase must not do.
  The full re-derivation is at `archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md`
  "IS P1.8's DONE WHEN MET? RE-DERIVED HERE, AND THE STEP IS NOT CLOSED BY THIS PHASE".
  NOTHING IS AUTHORISED.
  **CLOSED 2026-08-30 (`49f9fd2`):** the DONE WHEN was minted
  2026-08-27 (B1) —
  `ROADMAP.md § P1.8 — Seller creation from the phone` "P1.8b's DONE WHEN — MINTED 2026-08-27 (B1)"
  (`rg` for that exact string returns 1 hit) — so P1.8b now carries a criterion of
  its own and this decision is discharged. The "NOTHING IS AUTHORISED" above was
  the correct stance for the phase that RAISED it; a later phase (B1), not a
  building phase that would then be measured by it, did the minting.
- **WHO MAY WEIGH A WALK-IN CREATED BY ANOTHER OPERATOR ON THE SAME DEVICE,
  BEFORE IT SYNCS — an OPEN product question, recorded 2026-08-27 (P1.23 c3) with
  a SAFE default already in place.** The picker's `listForPicker` is
  OWNER-FILTERED, so a local seller operator A created offline is offered to A and
  not to B until it settles and a refresh carries the server row down, after which
  both see it as the cache's. **THE DEFAULT IS SAFE and nothing rests on changing
  it:** no row is lost, no bill is misattributed, and B simply cannot quote A's
  not-yet-synced seller — B waits for the sync, or re-creates. But WHETHER two
  operators on one handset should share a not-yet-synced walk-in is a WORKFLOW
  DIFFERENCE BETWEEN SHOPS — the S6 shape, one shop's shared counter against
  another's per-operator till — and the filter has picked one answer. *Not put to
  the owner now, deliberately:* the safe default ships and this line records that
  it was a CHOICE, so a later shop's need is met as a decision and not discovered
  as a surprise. *The decision, if it is ever taken:* widen `listForPicker` from
  the identity to the device, and state what that does to the `created_by` a bill
  still carries. NOTHING IS AUTHORISED.
- **TWO OFFLINE HANDSETS CAN MINT THE SAME SELLER CODE, AND THE RULE THE P1.18
  CRITERIA MANDATE THEN BINDS ONE OF THEM TO THE OTHER'S SELLER.** Raised
  2026-08-18 by the independent review of P1.18's acceptance criteria, and filed
  here rather than at the step because it is a defect in the DESIGN THE CRITERIA
  MANDATE and not a defect in a criterion — the step's own supersession is at
  `ROADMAP.md § P1.18 — One outbox, several kinds of work` "THE SEVEN ARE SUPERSEDED, NOT DELETED".
  NOTHING BELOW IS AUTHORISED.

  **The mechanism, re-derived 2026-08-18 at `e6249f6`.** `LocalOutboxSeller.code`
  in `mobile/src/sync/outbox.ts` is `readonly code: string` — non-optional — and
  the comment above it states the rule: a re-send is recognisable only by a code
  collision, so a 409 on this kind means ALREADY EXISTS and settles the row. The
  device must therefore mint a code while offline, and no arbiter exists while two
  handsets both are. If both mint the same code, the first to drain creates the
  seller and the second collides on `uq_sellers_tenant_code`. The server's 409
  body carries `kind`, `code`, a Thai `message`, `entity` and `conflicting_code`,
  and the only variable content in it is THE CALLER'S OWN CODE HANDED BACK — no
  row id, no name, no owner, nothing that identifies WHOSE row holds it. Under the
  mandated rule the second device settles, and its local seller is now bound to a
  different person's server row. Every bill it files afterwards is a cash purchase
  recorded against the wrong seller, on rows carrying `id_number` and `address`,
  and hard rule 5 forbids deleting the bill.

  **AND THE CLIENT CANNOT TELL THE TWO APART EVEN IF IT WANTED TO**, which is why
  this is not a coding slip somebody would notice. `mobile/src/master/createSeller.ts`
  classifies a 409 on the STATUS plus one fact the caller already holds — whether
  it supplied a code — and never calls `response.json()` on that branch at all.
  That is deliberate and correct for the reason its header gives: a refusal body
  on this route can echo an ID CARD NUMBER. So the discriminator this case needs
  is not merely absent from the client, it is behind a rule the client is right to
  keep.

  **IT IS NOT THE 409 CASE ALREADY RECORDED.** That one is `duplicate_code`
  against `code_assignment_failed` — one status, two server meanings, settled by
  asking what the CALLER sent
  (`lessons/README.md § Lessons` "THE DISCRIMINATOR WAS IN THE REQUEST", indexing
  `correct-classification-can-still-render-as-an-error.md`, whose P1.8a amendment
  is the entry meant). **The citation is pointed at the INDEX and not at the lesson
  file on purpose:** `tools/verify_citations.ps1` parses a filename with the class
  `[A-Za-z0-9_/.]`, which has no hyphen, so a citation naming any lesson file is
  not parsed at all — it is INVISIBLE to the checker rather than BROKEN by it, and
  that is recorded under `OPEN_ITEMS.md § Documentation` below.
  This is a THIRD pair inside `duplicate_code` itself: *my own prior send* against
  *another caller's row*. The earlier discriminator cannot separate it, because
  both sides of this pair supplied a code.

  **A SECOND, QUIETER HALF, and it is why the non-optional `code` is
  load-bearing.** Where a draft supplies NO code the server mints one and inserts,
  so a duplicate send returns 201 and a SECOND seller row rather than any
  collision at all — no signal, no error, two sellers for one person.

  *Contradicts:* the settle-on-409 rule the P1.18 criteria state as established,
  against `sellers` having no idempotency key and its codes being device-minted
  while offline. *The decision owed:* what identifies a locally created seller
  across devices before the server has seen it — a device-scoped code space, a
  server-minted reservation taken while online, a client-supplied idempotency key
  on `POST /sellers`, or accepting duplicates and reconciling in the back office.
  Each is a different schema and a different offline story. *Not done:* nobody has
  decided, and the sketched types at `ac535c2` assume the question away. *Unblocks:*
  the P1.18 design step, which cannot specify the seller kind until this is
  answered.

  **CLOSED 2026-08-23 — THE *DECISION OWED* IS ANSWERED, AND EVERY OTHER WORD
  ABOVE STAYS AS THE RECORD OF WHY THE QUESTION WAS ASKED.** The mechanism, the
  two halves of it, the four options and the NOTHING BELOW IS AUTHORISED are
  untouched, and this file is still the only place the mechanism is written down.
  **The owner selected the SECOND option: a server-minted reservation, taken while
  online.** It is recorded with its consequences, and with the cost he was shown,
  at `ROADMAP.md § What the owner has settled` "S22 — WHAT IDENTIFIES A LOCALLY CREATED SELLER ACROSS DEVICES".

  **WHAT THIS CLOSURE DOES NOT DO, said here so the entry is not read as
  finished work.** It designs nothing. The three things the design still owes —
  how many codes a device holds, when the holding refills, and what the screen
  says when it is running low and when it is empty — are named at that decision
  and answered nowhere, and the reservation puts a SERVER route and a RELATION
  inside P1.8b that nothing in this repository implements. **And the cost is
  recorded rather than resolved:** a reservation is finite on the device, so the
  yard's inability to create a walk-in is RELOCATED to the moment a handset runs
  out rather than removed. The *Unblocks* clause above is met — the design step
  is no longer blocked — and that is the whole of what changed.

- **THE BOOT PATH TELLS A SESSION TWO DIFFERENT THINGS ABOUT ORDER, AND EVERY
  SESSION READS BOTH.** Held over from P-PASTESET and filed 2026-08-18. Re-derived
  at `e6249f6`: `CLAUDE.md § Workflow` "Show a diff before editing any existing file"
  is line 498, unconditional and about EVERY existing file; the
  measure-before-the-write bullet four bullets later opens at line 502 and its
  second sentence reads that afterwards *"is the normal order and it is right
  almost everywhere, because almost everything can be corrected."* NOTHING BELOW
  IS AUTHORISED.

  **WHAT KIND OF DISAGREEMENT THIS IS, STATED PRECISELY RATHER THAN DRAMATICALLY,
  because the precision is what the decision turns on.** The two bullets are not
  contradictory INSTRUCTIONS: one governs SHOWING a diff to the owner, the other
  governs MEASURING a value, and a session can obey both. What collides is a rule
  and a rationale. The second bullet's stated principle — the before-order earns
  its cost only where the write cannot be undone — is general, and a file edit in
  a git repository is the most correctable write there is. So the first bullet's
  UNCONDITIONAL form has no surviving argument behind it once the second is
  granted, while the first bullet is still what the boot path says. A session that
  reads both in order is told to do something the next bullet explains is
  unnecessary here, and neither bullet mentions the other.

  **WHY IT NEEDS A DECISION RATHER THAN AN EDIT.** Which one gives way is a
  question about how the owner wants to review, not about the code: showing a diff
  first is a DISCLOSURE discipline whose value is that he sees a change before it
  exists, and that value is untouched by whether the change is reversible. If that
  is the reason, the first bullet is right and the second's principle needs a
  boundary saying it is about measurement only. If it is not the reason, the first
  bullet should say what it actually applies to. Either way one of two boot-path
  files changes, which is why no session should settle it in passing.

  **THE PRECEDENT for a boot-path disagreement getting its own phase** is
  `CLAUDE.md § Scope and status` "Superseded 2026-08-16:", where CLAUDE.md and
  `ROADMAP.md` disagreed about whether forward steps were R-numbers or P-numbers
  and the repair was a dated supersession rather than a rewrite. **This entry is
  not that repair and does not attempt it.**

  *Contradicts:* `CLAUDE.md`'s Workflow bullet at line 498 against the principle
  stated by the bullet at line 502, both of which load unconditionally at the
  start of every session. *The decision owed:* whether "show a diff first" is a
  disclosure rule that survives reversibility, or a measurement rule that the
  later bullet already bounds. *Not done:* the practice has followed the second
  for as long as anyone can measure, and no phase record claims otherwise.
  *Unblocks:* nothing built — it removes a standing disagreement between two rules
  a session is told to obey before it does anything else.

- **SIX REVIEW FINDINGS AGAINST THE 2026-08-17 DECISIONS, AND THEY CONTRADICT
  PARTS OF WHAT THOSE DECISIONS SET UP.** ONE entry, on purpose: a reader who
  meets one side alone acts on a plan that was already questioned. They are
  FINDINGS AND NOT TASKS — nothing below is authorised, and each ends in a
  decision only the owner can take. The decisions they bear on are S7-S13 at
  `ROADMAP.md § What the owner has settled` "SEVEN MORE, FROM A SECOND WORKING SESSION"
  and the eight-item entry under
  `OPEN_ITEMS.md § Blocking one real paying shop`.

  **(a) THE PLAN CUTS ONE SUBSYSTEM FOR BEING TOO LARGE AND ADDS A LARGER ONE IN
  THE SAME CONVERSATION.** Offline seller creation was cut on the ground that the
  queue has no shape for a second kind of work —
  `ROADMAP.md § P1.8 — Seller creation from the phone` "The send queue has ONE row type over ONE table"
  and
  `ROADMAP.md § P1.8 — Seller creation from the phone` "EIGHTEEN sites hand-parallel the send and void paths".
  Photo sync needs the queue to carry a second kind TOO, and a worse one: the
  payloads are megabytes of binary rather than a row, and hard rule 8 means a
  photo taken offline must be written locally first and uploaded later, which IS
  the same queue work. *Contradicts:* the S12 photograph decision against P1.8b's
  cut. *The decision owed:* one criterion for both. If the queue gains a second
  kind for photographs then P1.8b becomes nearly free and should RETURN; if the
  queue is not to gain one, photo sync is bounded by the same argument that cut
  P1.8b. *Not done:* nobody has decided which. *Unblocks:* the owner picking the
  criterion before either is scheduled.

  **CLOSED 2026-08-17 by S14** (`ROADMAP.md § What the owner has settled` "S14 — THE DEVICE OUTBOX BECOMES ONE MECHANISM").
  The criterion is ONE mechanism for all kinds, and it resolves on the side that
  REVERSES the cut: P1.8b returns. The finding's diagnosis was sharpened in the
  answering — the cost was never a second ROW TYPE, it is a second HAND-WRITTEN
  PATH, which is why the seven-item survey stands unchanged and becomes the spec
  rather than the objection. **No P-number was minted:** what is recorded is that
  the reason for the cut no longer holds, not a step that builds the replacement.

  **SUPERSEDED THE SAME DAY, 2026-08-17 — the step now exists as P1.18**
  (`ROADMAP.md § P1.18 — One outbox, several kinds of work` "must express ORDERING and RETRY POLICY PER KIND").
  The planning pass that wrote it measured something that changes how it must be
  built: the send and void drains in `mobile/src/sync/engine.ts` are not
  duplicates but DELIBERATELY DIFFERENT — send enforces strict head-of-line order
  with backoff, void has no backoff, no time gate and no ordering — each
  difference carrying a device incident behind it. **A single shared policy would
  be a regression either way it went**, so the mechanism must express ordering and
  retry policy PER KIND. That is recorded at the step and not restated here.

  **(b) STORING PHOTOGRAPHS IN THE DATABASE MAY MAKE P1.2's OWN ACCEPTANCE
  CRITERION IMPRACTICAL.** That criterion is
  `ROADMAP.md § P1.2 — A server a shop can reach` "schedule nobody triggered by hand has been fetched from off-box"
  and restored, with the row counts read back. At a few hundred MB a day the
  dump-restore-verify cycle becomes something nobody actually performs, and an
  unperformed backup is a claim rather than a backup. **THE SIZE IS THE ADVISING
  SESSION'S ARITHMETIC AND WAS NEVER MEASURED** — no photograph exists, no
  camera path is written, and no resolution or compression has been chosen, so
  the figure names an order of magnitude to re-derive and nothing more.
  **THE COUNTER-ARGUMENT IT RESTS ON, stated because it may well win:** a lost
  bill is cash with no record; a lost photo leaves a bill that still says what was
  bought, from whom, at what price, by whom and when. The photograph
  CORROBORATES the record — it is not the record — so the two do not need the
  same durability. *Contradicts:* S12 against P1.2's DONE WHEN. *The decision
  owed:* whether photographs live in the database at all, or beside it under a
  different retention and a different backup. *Not done:* undecided, and
  unmeasured. *Unblocks:* one measurement — a real photograph at a chosen
  resolution, times the bills a day.

  **CLOSED 2026-08-17 by S15** (`ROADMAP.md § What the owner has settled` "S15 — PHOTOGRAPHS LIVE BESIDE THE DATABASE").
  Photographs live BESIDE the database, not in it. **It was closed on this
  entry's own counter-argument and not on its arithmetic** — the photograph
  corroborates the record and is not the record, which is a claim about what the
  data IS and does not rot when a size estimate does. **The unmeasured figure
  above stays labelled as unmeasured and must not be carried forward as a fact.**
  Retention, resolution, compression and where "beside" physically is are all
  still open and belong to whoever plans the photo path.

  **(c) "A SETTINGS STORE" IS MORE MACHINERY THAN THE EIGHT ITEMS NEED.** Read as
  DATA rather than as a feature, the eight are not one thing: shop identity is
  shop MASTER DATA; the grade model is genuinely relational, because it replaces a
  CHECK constraint with a per-tenant table; lump-sum is really a change to the
  bill LINE; and the remaining five are scalars. **Five scalars are five
  columns.** A JSON bag would be the first value in this schema with NO
  CONSTRAINT ON IT, in a system whose whole discipline is that a wrong value must
  be unrepresentable. **FOUR named CHECK constraints that establish that
  discipline** — four of them, not all; there are more, and these are the ones
  that make the point — are `ck_items_net` (`0001_initial_schema.py:267`, net = gross -
  tare), `ck_bills_void_consistency` (`0001_initial_schema.py:224`, the three void
  fields move together), `ck_sellers_grade`
  (`0003_move_grade_to_sellers.py:31-32`) and `ck_shop_code`
  (`0009_directory_shop_codes.py:389`, the eight-character alphabet). *Contradicts:*
  the per-tenant settings home recorded as a FOUNDATION under
  `OPEN_ITEMS.md § Schema requirements raised by the 2026-08-17 legal research round`,
  and the framing of the eight-item entry as one list. *The decision owed:*
  columns, or a store. *Not done:* nothing is built either way, which is the one
  piece of luck here. *Unblocks:* the owner choosing, before the first capability
  invents its own private place to keep a flag.

  **CLOSED 2026-08-17 by S16** (`ROADMAP.md § What the owner has settled` "S16 — THE EIGHT PER-TENANT VALUES ARE STORED BY KIND").
  Columns, not a store: scalars become columns with their own CHECK constraints,
  the grade model becomes a per-tenant TABLE replacing a CHECK constraint,
  lump-sum is a change to the bill LINE, and shop identity is master data on
  `tenants`. **No JSON bag.** The four named CHECK constraints above are the
  evidence for that discipline and are to be re-derived from the migrations
  rather than copied from this entry.

  **(d) "ALL SIX SCHEMA CHANGES BEFORE THE DESKTOP" IS A SELF-IMPOSED DEADLINE.**
  D10's real deadline is BEFORE THE FIRST REAL ROW —
  `ROADMAP.md § The decisions the ordering forced` "D10 — the pilot runs on the production database"
  — and S7 moves that to after all three programs exist, so the deadline moved
  outward rather than inward. Five of the six come from one legal research round
  whose four limits are recorded in this file, including **a district and province
  that were not in the question put to it** and that the owner has not confirmed;
  the sixth, `sellers.created_by`, came from P1.8a instead. *Contradicts:* S8's
  sequential order read as a deadline, and the research round's own recorded
  limits. *The decision owed:* let each schema change be PULLED by the feature
  that needs it rather than pushed as a set. *Not done:* the set is being treated
  as one deliverable. *Unblocks:* the owner accepting per-feature pull, which also
  keeps the unverified local-ordinance material out of a migration.

  **CLOSED 2026-08-17 by S17** (`ROADMAP.md § What the owner has settled` "S17 — SCHEMA CHANGES ARE PULLED BY THE FEATURE THAT NEEDS THEM").
  Per-feature pull is accepted. **Two of the six already have a feature pulling
  them** — `sellers.created_by`, because P1.8a made seller creation reachable
  from the yard and nothing records who did it, and the per-tenant grade default,
  which blocks a whole shop shape today. The other four wait for a feature. This
  is also what keeps the unverified local-ordinance material out of a migration,
  by the route this entry already named.

  **(e) ADDING AN OWNER ROLE SILENTLY DEGRADES THE MOBILE CLIENT, and it works
  today only by a fail-open default chosen for an unrelated reason.** The client's
  role list is hardcoded to two values (`mobile/src/session/deviceRole.ts:56`,
  `ROLES = ["admin", "staff"]`); an unrecognised role parses to `null` (`:155`);
  and the void gate is `role !== "staff"` (`:173`), so **an owner would be read as
  UNKNOWN and shown the void button.** That is not a hole today, because the
  fail-open was chosen deliberately for a different reason — `:23-32` argues that
  a real admin whose token merely failed to parse must not be locked out of the
  one action that corrects a wrong bill. A third role turns that same default into
  a role being granted a button by accident. **AND THE FILE SAYS SO IN WORDS THAT
  BECOME FALSE THE MOMENT THE THIRD ROLE LANDS:** `:52-54` reads "The only two
  roles there are", citing migration 0001's CHECK, and **nothing compares that
  comment or that array to the constraint.** The server has three spellings of the
  pair and binds two of them at import (`server/app/users.py:351` raises
  `RuntimeError` when `users.Role` and `auth.ADMIN_ROLE`/`STAFF_ROLE` diverge);
  the phone is a FOURTH spelling with no such guard, and nothing on either side
  reads the migration. *Contradicts:* S9. *The decision owed:* whether the client
  is taught the third role in the same change that adds it, and whether the
  fail-open is re-argued for three roles rather than inherited from two. *Not
  done:* reported, not fixed. *Unblocks:* a decision at S9's implementation; the
  code half of it belongs beside the other client/server seams under
  `OPEN_ITEMS.md § Code debt found and left in place` and is cross-referenced
  rather than moved.

  **CLOSED 2026-08-17 by S18** (`ROADMAP.md § What the owner has settled` "S18 — WHEN THE OWNER ROLE LANDS, THE MOBILE CLIENT LEARNS IT").
  The client is taught the third role in the SAME change that adds it. **The
  fail-open is deliberately KEPT, and it was re-argued rather than inherited:**
  enforcement is on the server, and a real admin whose token merely failed to
  parse must not be locked out of the one action that corrects a wrong bill —
  which holds for three roles as it did for two. What does not survive the third
  role is the comment asserting there are only two, with nothing comparing it to
  the migration. **Every line number in this entry is a clue and is to be
  re-derived in the pass that implements S9.**

  **(f) REMOVING THE MID-PROJECT PILOT REMOVES THE ONLY INPUT TO P2.4 AND P2.5,
  AND NOTHING REPLACES IT.**
  `ROADMAP.md § P2.4 — The residues only real volume can settle` "that no amount of staging"
  names four things staging cannot reach, and
  `ROADMAP.md § P2.5 — What the day actually broke` "It cannot be enumerated"
  says its own content cannot be written in advance without pretending to know it.
  Both depend on P2.1, and S7 pushes P2.1 out past all three deliverables. *This
  is not an argument for reinstating the pilot* — S7 is settled — *it is a
  statement that two steps now have no evidence source and no substitute named.*
  *Contradicts:* S7 against P2.4 and P2.5 as written. *The decision owed:* what
  those two steps are fed by, or the acceptance that both stay open until the
  first real shop trades. *Not done:* no replacement is named anywhere. *Unblocks:*
  the owner saying which.

  **CLOSED 2026-08-17 by S19** (`ROADMAP.md § What the owner has settled` "S19 — P2.4 AND P2.5 STAY OPEN UNTIL A REAL SHOP TRADES").
  The second option is taken: both steps stay open until a real shop trades, and
  no substitute is invented. **The finding was accepted exactly as written** — as
  a statement rather than as an argument to reinstate the pilot, which is the
  distinction it drew about itself and which the answer preserves. Inventing a
  staging substitute would produce evidence about staging, which is the one thing
  both steps already say cannot reach them. The acceptance is recorded at both
  steps and not only in the decision, so a session reading either one is told
  there.

- **THE PRINT GATE AND THE PHOTOGRAPH DISAGREE ABOUT WHEN A SLIP MAY BE PRINTED,
  AND NO FILE SAYS WHICH WINS.** Found 2026-08-17 while recording S14-S19; a
  FINDING with a decision owed, not a task, and nothing here is authorised.

  S12 has the desktop staff recheck the bill against the photograph and PRINT
  (`ROADMAP.md § What the owner has settled` "The desktop staff then rechecks the bill against the photo"),
  while P1.17's DONE WHEN gates printing on a SYNCED bill and does not mention a
  photograph at all
  (`ROADMAP.md § P1.17 — Thermal slip printing from the desktop` "asked to print a bill").
  Hard rule 8 means the photograph is written locally first and therefore arrives
  AFTER the bill, by a gap with no bound — the first bill this system ever synced
  was weighed in airplane mode. **So the desktop can hold a bill it is entitled to
  print and a photograph that has not arrived**, and the two sentences give
  opposite answers about what it should do.

  *Contradicts:* S12 against P1.17's DONE WHEN. *The decision owed:* whether the
  print gate waits for the photograph, prints without it, or prints with a mark
  saying the photograph is not yet here. *Not done:* recorded only; P1.17's DONE
  WHEN is untouched and no code exists on either side. *Unblocks:* P1.17 being
  implementable without its author choosing this by accident.

  **THE NEGATIVE CLAIM, WITH ITS WORDS NAMED.** Searched case-insensitively with
  ripgrep over `ROADMAP.md`, `OPEN_ITEMS.md`, `PROJECT_STATUS.md`,
  `ARCHITECTURE.md` and `SRS_MAP.md` for `photo|photograph|image|picture|attach`:
  50 lines. Of those, exactly **two** also carry `print|slip|esc/pos`, and they
  are the two quoted above — **and the second is a DIFFERENT SENSE of the word**,
  where "photographed" means photographing the printed slip as evidence, not the
  bill's photograph. So the two subjects meet nowhere. **"Not found with these
  words" is not "there is none"**; a reader who widens the search and finds a
  governing sentence should correct this entry rather than assume it was thorough.

- **A RAW COUNT INSIDE AN ACCEPTANCE CRITERION ROTS, AND ONE ALREADY HAS.**
  Found 2026-08-17. RECORDED, NOT REPAIRED.

  `ROADMAP.md § P1.12` requires "all **fourteen** `prove:*` scripts" in two
  places — its dependency clause and its DONE WHEN. Counted 2026-08-17 by
  `grep -oE '"prove:[^"]+"' mobile/package.json`, unique matches: **28**. That
  pattern matches a script NAME and would also match one script's name appearing
  inside another's command line, so re-derive it and say what you counted.
  **Nothing went red when the suite grew.** The criterion simply stopped
  describing it, and a step's DONE WHEN is the sentence this project uses to
  decide a step is finished.

  **THE DEFECT IS NOT THE DIGIT.** Replacing "fourteen" with 28 commits the same
  defect with a fresher value: 28 will rot exactly as 14 did, silently, and the
  next reader gets no more warning than this one had. What is wrong is that an
  acceptance criterion carries a RAW COUNT with nothing to announce that it
  turned.

  **THREE REPAIR FORMS, AND THIS REPOSITORY ALREADY CONTAINS ALL THREE.**
  *(i) Anchor it to a commit.* `ROADMAP.md` line 1192 reads "Measured at
  `16a1938`, fourteen statements in the local store select rows by predicate" —
  anchored, therefore a statement about a moment that has already happened,
  therefore true for ever. It is roughly three hundred lines from the two wrong
  ones, in the same file.
  *(ii) Name the SET and its SOURCE so the number is PRODUCED, not stored.* "every
  `prove:*` script declared in `mobile/package.json`, counted at the moment it is
  run" cannot rot, because it is a rule for producing the number rather than the
  number. The count then belongs in the RUN'S REPORT and never in the criterion.
  This is the form P1.12 should take.
  *(iii) Confine the count to ONE site and declare in that same sentence that it
  is the only one.* `lessons/a-check-that-never-went-red-was-never-observed.md`
  does exactly this at its head, **and it does so because the defect had already
  happened THERE**: the count used to live in three headings and in that file's
  index line, all four rotted together as the body grew from four to nine, and
  the index line ended up reading "Six mechanisms" and "a NINTH mechanism" in one
  sentence. This form does not stop a number going stale; it makes going stale a
  one-line edit instead of a four-site sweep nobody completes. **Reach for it when
  prose genuinely needs a number.**

  `:1523` and `:1538` use none of the three, and they are two sites for one
  number — the exact shape that rotted in that lessons file.

  **THE DIVIDING LINE, AND IT IS WORTH MORE THAN THE FINDING.** The next reader
  will meet a raw count in a criterion again, and the question is not *"is there a
  number"* but **"CAN THIS SET GROW?"** A count is SAFE when the set is closed by
  a definition somebody else owns — "all three programs" is the three deliverables
  of S1, part of the architecture rather than the result of a measurement. It is
  SAFE FOR A SECOND REASON when the set is enumerated in the same sentence, as
  `ROADMAP.md`'s "all four" is by the four readers named immediately after it:
  that set can grow, but the growth is VISIBLE, because anyone adding a fifth is
  looking at a list of four rather than at a bare digit. **It ROTS when the count
  is bare and the WORK adds to the set**, which is what `prove:*` is — it grows
  every phase and nothing announces it.

  **AND A SAFE NUMBER CAN BE DEMOTED, WHICH IS WHY THE RULE IS A QUESTION AND NOT
  A LIST.** `ROADMAP.md`'s "all four tiers" is safe TODAY because the grade set is
  closed — **and it is closed in FOUR places**: `product_prices.grade` and
  `purchase_bill_items.grade` CHECKs in `0001_initial_schema.py`,
  `ck_sellers_grade` in `0003_move_grade_to_sellers.py`, and
  `Grade = Literal["A","B","C","D"]` in `server/app/master.py`, whose neighbouring
  comment says in its own words that it mirrors the CHECKs so a bad grade is a 422
  rather than a CheckViolation 500. **S16 opens all four**, because the grade
  model becomes a per-tenant table and the first of the eight per-tenant values is
  how many tiers there are, what they are called, and whether tiers exist at all.
  **The fourth site is not merely a fourth copy:** a `Literal` is a compile-time
  type, and a set a shop chooses at run time cannot be one, so S16 does not just
  invalidate a count there — it removes the form the constraint is expressed in.
  Re-derive all four before acting on any of it.

  **ONE CONSEQUENCE NAMED AND DELIBERATELY NOT ANSWERED**, because it belongs to
  whoever plans S16: the second of those four sites is on `purchase_bill_items`, a
  HISTORICAL BILL LINE, which hard rule 5 forbids deleting and hard rule 6 forbids
  recomputing. Old lines will carry grades a shop may later stop defining.

  **AMENDED 2026-08-18 — IT IS FIVE, NOT FOUR, AND THE ENTRY ABOUT COUNTS THAT
  ROT HAS ROTTED. Both paragraphs above are left exactly as written.** `9ad225e`
  added `ck_tenants_default_grade` on `tenants.default_grade`
  (`server/migrations/versions/0010_tenants_default_grade.py:52`), which is the
  fifth. **Where it came from is worth one sentence, because it is the same shape
  as the finding it damages:** the commit that let a shop which does not grade its
  sellers trade at all did so by adding another constraint hardcoding A-D, so the
  work relieving one per-tenant block widened the count in the entry warning that
  counts widen. The code already says five in two places — that migration's
  docstring at `:27` and `server/app/master.py:114` — and this entry did not.

  **RE-DERIVED HERE RATHER THAN INCREMENTED, WHICH IS WHAT `Re-derive all four`
  ASKS FOR, AND RE-DERIVING FOUND MORE THAN A FIFTH.** What you count depends on
  a distinction neither paragraph above draws, so each figure below carries its
  own command AND its own definition. **The bare word "sites" conflates the two,
  and that conflation is the whole mechanism here:** it is how a column that was
  DROPPED three migrations later stayed on a list of things a future decision
  must open.

  - *Sites whose SOURCE TEXT encodes the set A-D: five.* Definition — an
    occurrence, in source text on the path to head, that writes the four members
    out. Measured 2026-08-18 by `git grep -n "IN ('A', 'B', 'C', 'D')" --
    server/` for the CHECKs and `git grep -n "Grade = Literal" -- server/` for
    the type. They are `product_prices.grade` and `purchase_bill_items.grade` in
    `0001_initial_schema.py:169` and `:253`; `ck_sellers_grade` in
    `0003_move_grade_to_sellers.py:31`; `ck_tenants_default_grade` in
    `0010_tenants_default_grade.py:52`; and
    `Grade = Literal["A", "B", "C", "D"]` at `server/app/master.py:119`. A sixth
    occurrence sits in `0003`'s DOWNGRADE (`ck_items_grade`, `:42`) and is not
    counted, because nothing reaching head ever runs it.
  - *CHECK constraints in force on a database migrated to head: three.*
    Definition — a constraint a write would actually have to satisfy today.
    Measured by reading the stack FORWARD with every DROP applied
    (`git grep -n "grade" -- server/migrations/versions/`, then reading each hit
    in revision order): **`0003`'s UPGRADE drops the column the second site is
    on** — `ALTER TABLE purchase_bill_items DROP COLUMN grade` at `:25`, whose
    own comment at `:24` says the inline CHECK goes with it — and no migration
    `0004`-`0010` re-adds either. So `product_prices.grade`, `ck_sellers_grade`
    and `ck_tenants_default_grade` are the three in force. **The gap between the
    two figures is TWO and only one of them is the drop:** `master.py`'s
    `Literal` is not a database constraint at all, it is a Python type checked at
    the edge.
  - *THE LIMIT ON THE SECOND FIGURE, STATED RATHER THAN LEFT IMPLICIT.* It was
    derived by READING the stack, not by querying a database — this phase ran no
    SQL. The authority for "what constraints exist" is `pg_constraint` on a
    database at head, and it was NOT consulted. That is the same instrument
    weakness this correction is about, one level up: a careful forward read of a
    log is still a read of the log. Anyone acting on the figure should take it
    from the database.

  **THAT MAKES THE CONSEQUENCE PARAGRAPH ABOVE FALSE, and it is the more useful
  half of this amendment.** It reasons about `purchase_bill_items` as a live
  historical constraint whose old lines "will carry grades a shop may later stop
  defining". They will not: the column was dropped in `0003` and the data with it,
  so bill LINES carry no grade at all today and the hard-rule-5/6 problem it names
  does not exist in that form. Whether it returns in another form — a bill line
  priced off a tier a shop later renames — is a real question for whoever plans
  S16, and it is not the one that paragraph asks. **Re-derive all five, and say
  which of the two definitions you counted.**

  **WHY THIS WAS WORSE THAN A WRONG FACT, and it is why the correction runs
  longer than the error.** Hard rule 6 stores `unit_price` AND `list_price` on
  the line (`0001_initial_schema.py:257-258`), so a bill records the PRICE a
  grade produced and never the grade itself — a later change to the grade model
  CANNOT REACH A HISTORICAL BILL BY CONSTRUCTION. `0003` closed that on purpose,
  and its own docstring gives the reason: line items do not carry a grade,
  because per SRS 1.6 the grade belongs to the SELLER. So the paragraph above did
  not merely miscount by one. **It raised as an open risk a case that cannot
  occur**, and filed it against whoever plans S16. A wrong fact costs a
  correction; an invented risk costs whatever work somebody does about it, and
  that work is indistinguishable from diligence while it is being done.

  **THE ROOT, NAMED BECAUSE IT WILL RECUR AND THIS REPOSITORY HAS TEN
  MIGRATIONS.** A migration stack is a LOG of what was done, not a description of
  what IS. An upgrade file records ONE MOMENT, so reading it as current state is
  reading history as the present — and counting live constraints by grepping
  migration source will keep producing this, because the grep is a correct
  instrument answering a neighbouring question and returns a plausible integer
  with no error and nothing red. Written up, with the hard-rule-6 argument above
  as its evidence:
  `lessons/README.md § Lessons` "a-migration-stack-is-a-log-not-a-schema.md".
  **Cited through the index and not at the lesson directly, which is forced
  rather than stylistic:** `tools/verify_citations.ps1`'s filename pattern is
  `[A-Za-z0-9_/\.]+`, with NO HYPHEN, so a hyphenated lesson filename inside
  backticks matches nothing and the citation is INVISIBLE to the checker — not
  broken, not counted, silently absent. Measured here: the first draft cited the
  lesson directly and `CITATIONS` moved by ONE where two citations had been
  added.

  **HOW IT GOT IN, ATTRIBUTED PLAINLY RATHER THAN LEFT AS A PASSIVE.** The
  paragraph came from the ADVISING SESSION and was accepted into this file
  without the migrations being opened. That is exactly the promotion
  `CLAUDE.md § Workflow` "A REPORT IS A CLUE, NOT A SOURCE" forbids: a finding
  becomes a fact by re-measurement against the artefact in the current pass, and
  this one never was. **A schema report is the easy one to wave through**,
  because it cites a filename and a line number and both are REAL —
  `0001_initial_schema.py:253` exists and says what it was quoted as saying. The
  citation resolves; only the tense was wrong.

  **DO NOT SWEEP BY THE WORD. NAME THE SITES BY LINE NUMBER, AND RE-DERIVE THEM.**
  `git grep -n "fourteen" -- '*.md'` returned **nine** sites on 2026-08-17 *after*
  this phase's own first commit — the brief that ordered this entry said seven,
  and the two extra are the word "fourteenth" in the lesson amended by commit 1
  and in its generated copy. **The count moved inside the phase that records the
  finding, which is the finding.** Only two are in this class. The other seven
  must be left alone: the pinned one at `ROADMAP.md:1192`; two dated observation
  records in `PROJECT_STATUS.md`, which the pin-a-claim convention's own fallback
  for status files permits; "fourteen HOURS" in
  `lessons/a-stored-future-instant-is-a-promise-about-a-clock.md`, a unit of time
  and not a count of anything; and the ordinal in the amended lesson — each of
  those last three also appearing in `lessons/all-lessons.md`, which is
  GENERATED by `server/scripts/build_all_lessons.py`, so a hand edit there is
  overwritten on the next build and leaves the two copies disagreeing meanwhile.
  **Those are where a find-and-replace kills most quietly**, because nobody
  re-reads `lessons/` while editing `ROADMAP.md`, and the generated copy is not a
  file anyone reviews at all.

  *Contradicts:* nothing — it is a defect rather than a disagreement. *The
  decision owed:* which of the three forms P1.12's criterion takes. *Not done:*
  recorded, not repaired; repairing it rewrites a step's acceptance criterion and
  belongs to whoever plans that step. *Unblocks:* that rewrite, and a survey with
  a named scope — **criteria that count a set the work can add to** — which has
  been run over `ROADMAP.md` and has NOT been run over `PROJECT_STATUS.md`,
  `SRS_MAP.md` or `ARCHITECTURE.md`.

- **SHOULD A TYPED SHOP CODE BE CASE-NORMALISED? A PRODUCT DECISION, NOT A BUG,
  and it is deliberately not settled in code.** `ck_shop_code` admits only
  `^[A-HJKMNP-Z2-9]{8}$` — uppercase, and the alphabet excludes O, 0, I, 1 and L
  because those are what a human misreads off a thermal slip. `POST
  /auth/shop-code` compares the submitted string EXACTLY, so **a person who types
  their code in lowercase is refused with the same 404 as somebody guessing at a
  shop that does not exist.** That indistinguishability is correct and
  deliberate — D4 requires one refusal for every cause, and a distinct "wrong
  case" reply would be exactly the oracle it forbids. **The cost is that the
  refusal cannot teach.** Uppercasing the input before the lookup would fix the
  typing case at no disclosure cost, since the alphabet has no lowercase members
  for it to collide with. *Why it was not just done:* D4 does not decide it, and
  inventing input-normalisation behaviour for the one endpoint a shop owner meets
  first is the owner's call, not this session's. *Not done:* undecided.
  *Unblocks:* one line in the handler if the answer is yes, and a sentence in D4
  either way — including "no", which is a legitimate answer if the slip is always
  read as printed.
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
  **CORRECTED 2026-08-12 — IT HAS RUN, AND IT FOUND SOMETHING. Deleting the word
  "never" would not be enough here**, because a reader who met this entry
  corrected but bare would conclude the instrument has no track record, which is
  the opposite of what the record says.
  **WHEN: 2026-08-07**, on the sign-out work — which is the very candidate the
  *Unblocks:* above nominates. **WHAT IT FOUND**, recorded at
  `archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md § Previous phase` "The finding, in its own terms": `session`
  was a **hand-typed literal at all 21** of `proveSignOut.ts`'s `session:` call
  sites, S9's two included. S9 measured `pending` off a real `SqliteLocalStore`
  and then typed the session in beside it — so the one link R2b created, the
  sheet depending on session state, **was exercised by nothing**, and S9's own
  label claiming the halves differ in the ENGINE was the claim not established.
  **THE DISPROOF IS WHAT MAKES IT A FINDING RATHER THAN AN OPINION:** delete
  `setSessionEnded(true)` at `App.tsx:618` and `prove:signout`, `typecheck` and
  `typecheck:app` all stay green. The repair landed at `9f929ad`, found by
  `git log -S "sessionEndedAfterPass"` over the source rather than by reading
  commit subjects.
  **SO THE FIRST OF THE TWO OPEN QUESTIONS IS ANSWERED AND THE SECOND IS NOT.**
  A session held to these rules does find things, and what it found was a green
  proof measuring nothing — one of the three shapes `RED_TEAM.md` says the pass
  hunts first. Whether an EMPTY report from it can be trusted is still unknown,
  and still needs several runs. *Not done:* the trial is one run deep, not none.
  *Unblocks:* unchanged — more diffs through it.
- **No retention rule exists for scratch databases or backup directories,
  and the inventory is accumulating.** `server/scripts/BACKUP.md` states
  "No scheduling, no cloud or off-site upload, no retention or pruning",
  names `recycle_restore_scratch` as the one reusable verification
  database, and marks only `_proof/` dump directories safe to delete. As of
  2026-08-07 the cluster also holds `recycle_recon_pre0005b`,
  `recycle_clock_scratch` and `recycle_recon_scratch`, and the backup root
  holds every dump ever taken. **RE-MEASURED 2026-08-07 against
  `pg_database`, and the list above was already short by one: the cluster
  holds SEVEN `recycle%` databases — the live one plus
  `recycle_restore_scratch`, `recycle_recon_pre0005b`,
  `recycle_clock_scratch`, `recycle_recon_scratch`, `recycle_lock_scratch`
  (P1.4, never listed here) and `recycle_users_scratch` (the `GET /users`
  mutations).** The last of those holds **three bills the correct product
  could not have produced** — written through the real path while the id
  mutation sent a lock to a uuid naming nobody, so a supposedly-locked
  account still posted. That is exactly where such rows are supposed to
  land (`lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-
  database.md`), and it is also a reason this copy is not casually reusable
  as a clean baseline. One dump directory was added the same day,
  `recycle_20260807T151023Z_users-phase3`. **The inventory grows once per
  destructive phase, which is the shape of the problem rather than an
  incident.** *Not done:* deliberately — **inventing a
  retention rule in passing is how a convention gets set by accident**, and
  these directories hold real money data plus cluster password hashes.
  *Unblocks:* the owner deciding whether scratch databases are disposable
  and whether dumps get a retention window. Both become real questions at
  `R3`, when backups start running unattended and landing off-site.
  **SCRATCH-DB DISPOSABILITY DECIDED FOR THESE 18 IN M4 c3 — 2026-08-29
  (`b808fc2`); the dumps / backup-retention half is untouched
  and stays for R3 / P3.8.** The owner decided (M4 c3) that CONFIRMED-DISPOSABLE
  scratch databases may be dropped and UNCERTAIN ones kept. Re-derived against
  `pg_database`: 20 non-template databases down to 9. Each drop was measured FIRST
  — zero connections in `pg_stat_activity`, no database comment (only two of the
  eighteen carry a DROP-WHEN comment, and both are KEPT), and its provenance quote
  re-read at the artefact — then DROP ... WITH (FORCE) and absence confirmed in the
  same pass. DROPPED (11): `recycle_clock_scratch`(0008) and
  `recycle_users_scratch`(0007), stale and superseded (the entry "TWO SCRATCH
  DATABASES ARE FOUR MIGRATIONS STALE"); the six `recycle_p18b_break/_clock/
  _gbreak/_guards/_scratch/_users`(0012), the archived status record "THIS PHASE
  LEFT SIX SCRATCH DATABASES" calling them deliberate mutation debris, "none of the
  six a clean copy of anything"; `recycle_lock_scratch`(0007) and
  `recycle_p18a_scratch`(0011), orphaned throwaways of closed phases;
  `recycle_recon_scratch`(0012), the archived record "restored, mangled and
  restored again". KEPT (7): `recycle_keyshape_scratch`(0009) and
  `recycle_tw20260809_0009fixture`(0009), each carrying its DROP-WHEN in a database
  comment whose condition (the backup/restore schema symmetry green) is NOT met;
  `recycle_restore_scratch`(0012), which the datacl-grant item above needs as its
  evidence; `recycle_recon_pre0005b`(0004), UNCERTAIN with no provenance in any
  record; and the three LIVE per-run scratches `recycle_restore_source`,
  `recycle_restore_target` and `recycle_guards_scratch`, recreated every run. The
  closing read: 9 non-template databases remain — the 7 keeps, `recycle`(0012,
  untouched) and `postgres`; none of the 11 present.
- **A `reconcile.py` check that `created_by` is never NULL on an
  API-written bill — PROPOSED, not decided, and the cost is why.** After
  migration 0006 `POST /bills` cannot write a NULL (`create_bill` is
  `Depends(get_principal)`, which raises 401 before the handler body runs),
  so among rows the API wrote, a NULL is a regression. It would need **no
  date literal and no constant**, which is what would let it survive a
  rebuild where `prove_reconcile.py:634`'s `{"T0": 91}` did not. **The
  cost, stated because it is the whole reason this is a proposal:** direct
  INSERTs into `purchase_bills` are legitimate and exist —
  `prove_rls.py:104` and `:311` (inside throwaway tenants it tears down)
  and `prove_backup_restore.py:208` (its marker is VOIDED, never deleted,
  so one permanent authorless row per run). A naive "NULLs form a prefix
  in arrival order" check therefore goes red on every backup-proof run,
  and a failed `prove_rls` teardown would turn it red for a reason
  unrelated to money — the same objection that keeps two constraints out
  of `REQUIRED_CONSTRAINTS` above. *Not done:* awaiting the owner's
  accept/refuse. *Unblocks:* that answer — and first, deciding how such a
  checker would tell an API-written row from a directly-inserted one,
  which **nothing in the schema currently records.**
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
- **Whether `GET /users` should stay ADMIN-ONLY — SETTLED as `require_admin`
  2026-08-07 and recorded here as the owner's to revisit, NOT as the entry
  above wearing a second hat.** It is filed separately on purpose: the two
  look like one question and the DEFAULTS run opposite ways, which is the
  whole reason a session reading only one of them would get it wrong.
  **The asymmetry.** For `GET /bills` the data is already derivable by a
  phone today, so the decision there is whether to CLOSE a door standing
  open, and doing nothing changes nothing. For `GET /users` nothing in this
  API yields a colleague's NAME — a staff token can pull `created_by` uuids
  off bill headers (`bills.py:256`) and that is where it stops — so applying
  the convention every other list route follows (`Depends(get_principal)` on
  uoms, product-categories, products, sellers, bills) would have been a NEW
  disclosure of the shop's whole staff list, with roles, to every handset at
  the weighbridge, made by inertia rather than by decision. And the two
  directions do not cost the same: opening later is one dependency changed;
  closing after every phone has held the roster is not. *Not done:* the tier
  is what the code does and is proven to be so — `prove_revocation.py` CASE
  6b has three cells on it, and swapping in `get_principal` fires exactly
  those three and nothing else. What is open is whether it is what the OWNER
  wants. *Unblocks:* the owner's answer, which `ROADMAP.md § STAGE 3` "User
  management inside a shop" needs before it draws a screen — a roster the
  yard cannot open is a different screen from one it can.
- **Whether `GET /shop` should stay STAFF-READABLE while `PATCH /shop` stays
  ADMIN-ONLY — SETTLED in code by `9ad225e` and recorded here as the owner's to
  revisit.** Filed in the same shape as the `GET /users` question directly above,
  and for the same reason: it is a route TIER whose two directions cost different
  amounts. It is filed separately from that one because the table is different —
  these are the FIRST routes in this API over `tenants`, so whatever tier they
  carry becomes the precedent the next route on that table inherits.
  **The asymmetry.** The split is not a compromise, it is two different questions
  answered separately. READING is a yard need: the phone cannot explain a 424 it
  would otherwise present as the seller's fault without knowing whether a shop
  default exists, and the response carries the shop's own name and its own choice
  and nothing about any person. WRITING decides how every ungraded seller's bill
  in the shop is priced, standing, until someone changes it back — which is
  exactly the kind of choice the yard must not be able to make with a load on the
  scale. And the two directions do not cost the same in the usual way: opening
  `PATCH` later is one dependency changed; a shop that discovers its walk-in
  pricing was moved from the weighbridge cannot un-price the bills.
  **THE ARGUMENT EXISTS — AND NOT WHERE A READER OF THESE DOCUMENTS WILL MEET
  IT, which is the whole reason for this entry.** It is written twice, both times
  in code: the two route docstrings at `server/app/master.py:1100` and `:1115`,
  and the module comment above them at `:1062`. It is written a third time in
  `9ad225e`'s commit body. **Searched over every tracked `*.md` on 2026-08-18
  with `git grep -F`, these terms: `PATCH /shop`, `get_shop`, `update_shop`,
  `ShopUpdate`, `staff-readable`, `shop settings`, `ck_tenants_default_grade` —
  NOT FOUND WITH THESE WORDS, zero hits each.** `GET /shop` and `default_grade`
  each returned hits in exactly three and two files, and every one of them is
  text written by `3e35558` earlier the same day — excluded by IDENTITY, not by
  content, because a content filter would delete the true positives that resemble
  this session's own record. Before that commit both were zero.
  `ARCHITECTURE.md § 3.1 Three authentication tiers, not two` was not updated by
  `9ad225e` either, so its admin-only row does not name `PATCH /shop`.
  *Not done:* the tier is what the code does — `get_principal` on the GET,
  `require_admin` on the PATCH — and `9ad225e` observed both ends over real HTTP
  (staff `GET /shop` → 200, staff `PATCH /shop` → 403), so what is open is not
  whether it works but whether it is what the OWNER wants, and whether it should
  bind the next route over `tenants`. *Unblocks:* the owner's answer, which
  `ROADMAP.md § P1.16` needs before it draws the shop-settings surface it took as
  scope on 2026-08-18 — a setting the yard can read is a different screen from
  one it cannot.
  **CLOSED 2026-08-30 by the owner:** the tier STANDS — `GET /shop` staff-readable,
  `PATCH /shop` admin-only — as the precedent the next route over `tenants`
  inherits. NON-CONFLICT WITH D1 (staff see no money figure): a grade is a PRICING
  INPUT, not a money figure, so a staff `GET /shop` returning `default_grade`,
  `address` and `phone` reveals no takings, and D1 does not revoke this tier. The
  2026-08-30 unit widened both routes with `address` and `phone` under the same
  tier, unchanged.
- **Whether the shop NAME should become editable via `PATCH /shop` — the owner's,
  and NOTHING IS AUTHORISED.** Raised 2026-08-30 while building the settings
  surface (P1.23 item 4, unit 1), where a phase brief contradicted itself on it
  and the owner settled READ-ONLY. `9ad225e` records the standing decision that
  `name` is not editable: *"a shop's name is on printed slips and its code is
  immutable by decision, so changing either is a provisioning act rather than a
  setting"* (commit body). The 2026-08-30 unit honours it — `ShopUpdate` accepts
  `default_grade`, `address`, `phone` and refuses a `name` key (422
  `extra_forbidden`), and the settings screen shows `name` read-only. Whether the
  owner now wants `name` editable (a rebrand, a typo fix) is his to settle; until
  then the immutability stands. *Unblocks:* nothing built waits on it.
- **The shop-settings screen is ONLINE-ONLY — a CHOICE made this pass, not an open
  decision, and a cached read-only view MAY come later.** Made 2026-08-30 (P1.23
  item 4, unit 1, phase 2). Settings is not an outbox kind (a kind is the whole
  registry — P1.18), so there is no offline write; and offline the screen draws NO
  field and says one calm sentence that a connection is needed, because a value
  shown without a fetch is a claim about a cache this screen does not own
  (`src/settings/shopSettings.ts`). The advisor settled it this way; a later shop's
  need to READ its own address offline is then met as a DECISION — a cached
  read-only view stamped like the master cache — and not discovered as a defect.
  *Unblocks:* nothing built waits on it.
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
- **`.claude/` holds nine skills and a permission file, and nothing in
  this repository can see it — SURVEYED 2026-08-07, nothing inside it
  touched.** 15 authored files, 97,940 bytes: nine `SKILL.md` skill
  definitions (`async-python-engineering`, `buddhist-method`,
  `crash-safety`, `debug-mantra`, `defensive-coding`,
  `delivery-workflow`, `long-running-jobs`, `scrutinize`,
  `verification-discipline`) plus `settings.local.json`, which carries
  **51 pre-approved command patterns** — among them `git add`,
  `git commit` and `PowerShell(git *)`, so the prompt that would have
  put a commit in front of the owner is gone, while the instruction not
  to commit until they confirm still governs. `buddhist-method` is a
  third-party MIT clone pinned at `745caa74`, cloned 2026-05-11 and
  never fetched since; the other eight are authored.
  **The invisibility is the finding, not the content.** `.gitignore:30`
  is `.claude/`, so the directory sits in no commit: `git status
  --porcelain` reads clean with 143,689 bytes present, `git log` and
  `git blame` cannot reach it, it can never appear in a diff, it is in
  none of the four inputs `RED_TEAM.md` permits a red-team pass, and
  `START_HERE.md`'s reading order did not name it until the line added
  alongside this entry. Every reviewing role this project defines —
  owner, advising chat, red team, boot order — was structurally unable
  to see it. **What enters a session is the nine `description:` lines
  (4,989 bytes), not the bodies (69,370 bytes)**, and those descriptions
  carry standing imperatives: one orders a verbatim recital at the start
  of any debugging session, one says to trigger even when the user does
  not name it, and one fires on the word "audit".
  **Eleven disagreements with this repository's own rules were found,
  labelled A-K, and are named here by WHERE each one sits and
  deliberately NOT restated** — a second copy of the argument is the
  drift `CLAUDE.md`'s Scope and status forbids. **A** `delivery-workflow`
  rule 3 vs CLAUDE.md's lesson-writing rules; **B** `long-running-jobs`
  rule 1 vs the codepage-874 footgun; **C** and **D** `scrutinize` vs the
  LOCKED architecture with `RED_TEAM.md`, and vs `START_HERE.md`'s role
  split; **E** `debug-mantra`'s recital vs CLAUDE.md's Workflow, and vs
  itself; **F** and **G** `settings.local.json` vs the pipe footgun and
  the multi-line-argument footgun; **H** `async-python-engineering`
  rule 2 vs hard rule 8 with `lessons/queue-jam-must-be-visible.md`;
  **I** `delivery-workflow` rule 13 vs the LOCKED architecture; **J**
  `delivery-workflow` rule 6, which contradicts nothing and is endorsed
  by nothing; **K** `verification-discipline` rule 22 vs the trial
  ledger in `PROJECT_STATUS.md`. **To re-derive the survey**, read all
  15 authored files under `.claude/` against `CLAUDE.md`,
  `START_HERE.md`, `lessons/README.md` and `RED_TEAM.md`. The survey
  itself is not in this repository and is not going to be: it would be a
  second home for all eleven. Three dead grants inside
  `settings.local.json` were measured the same way and are recoverable
  the same way.
  **AMENDED 2026-08-08 — TWO OF THE NINE ARE RECONCILED, SEVEN ARE
  NOT.** `debug-mantra` and `buddhist-method` were read in full against
  `CLAUDE.md`, `START_HERE.md`, `lessons/README.md` and `RED_TEAM.md`
  and amended in place: four amendments to the first, five to the
  second. The 2026-08-07 figures above stand as a dated record; the
  current ones are nine `SKILL.md` files **74,342 bytes** (same
  definition as the 69,370 above: whole files, frontmatter included)
  and nine `description:` lines **5,013 bytes as line text, 5,022
  counting one terminator each** — the 4,989 above used the second
  definition, and the two differ by exactly 9 bytes, one per file.
  Every byte of the growth is accounted for: **+4,972** from these nine
  amendments and **+5,029** from `.claude/agents/argus.md`, which did
  not exist when the survey ran and makes **16 authored files, not
  15**; `.claude/` entire is now 153,690 bytes against 143,689, and
  10,001 is exactly 4,972 + 5,029.
  **E is closed, and what A-K did NOT contain matters more.** E named
  `debug-mantra`'s recital; the amendment resolves it in the direction
  the recital could never have worked from — the order is to recite
  VERBATIM a block that exists only in the body, while what enters a
  session is the `description:` line, so the only available compliance
  was a paraphrase the same skill forbids two rules later.
  **`buddhist-method` appears NOWHERE in A-K and five disagreements
  were found in it**: Kalāma treating a consulted source as verified,
  where every entry in `CLAUDE.md § Machine footguns` is a consulted
  source that lied; Sati assuming one state to re-read, where this
  system routinely has several; Anatta's discard against hard rule 5
  and against dated records; Pahāna sending deferred work to a code
  TODO against the one queue this file is, and calling a guard on an
  untrusted input a workaround; Upekkhā's hold-position unbounded by
  the owner's authority. **Seven outstanding is a FLOOR, not a count**
  — a skill that scored zero in the first pass scored five in the
  second, so the remaining seven are un-surveyed as much as undecided.
  **The `references/` files under `buddhist-method` (8,846 bytes,
  `ariyasacca-debug.md` and `extended-principles.md`) are
  UNRECONCILED** and are not covered by "two of nine": two of their
  lines fed the Pahāna amendment, the rest was read only for its
  preload cost.
  **OWNER RULING 2026-08-08: Nemesis preloads nothing.** `RED_TEAM.md`
  "and nothing else" wins; a preloaded body is a fifth input to a pass
  whose value is the narrowness of its four. The general rule drawn
  from it: **preloading a general skill beside a stronger
  role-specific rule licenses the looser reading, so prefer writing
  the discipline into the role definition**, as `.claude/agents/argus.md`
  already does — its own Kalāma, counts and negatives rules are
  stricter than the skill's. **That rule has no home yet.** It governs
  agent definitions; `CLAUDE.md § Workflow` is the candidate and it is
  not written there, because it was not in the approved edit.
  **Still open, and each is a thing NOT OBSERVED rather than a thing
  undecided.** The `skills:` agent-frontmatter field exists — read from
  the installed CLI 2.1.226 binary, described there as "Skills
  preloaded for this agent", in the same schema object as `tools` and
  `effort` that `argus.md` already uses — but **its YAML shape is
  UNVERIFIED** (name or path, scalar or list), and **that preloading
  injects the BODY rather than the `description:` is
  PLAUSIBLE-FROM-SOURCE AND UNOBSERVED**: the runtime calls the same
  `getPromptForCommand` a normal invocation uses, which was read in
  minified source and never watched running. One agent run with the
  field set settles both. Unobserved likewise: whether the rewritten
  `debug-mantra` `description:` actually causes a session to OPEN the
  body — that needs a fresh session and a tool-call count, which is the
  204-call measurement re-run, and it is the entire premise of the
  amendment. And **`Metis`, `Hephaestus` and `Nemesis` have no design
  anywhere in this repository** — one grep across every `.md` returns
  `argus.md:2` and nothing else — so any per-role preload
  recommendation rests on the role its name implies, Nemesis excepted,
  which the owner has now ruled on directly.
  **DE-VENDORED 2026-08-08 — `buddhist-method`'s nested `.git` IS
  REMOVED, and this paragraph is now the only copy of what it held.**
  45,749 bytes over 29 files, deleted so that tracking `.claude/` writes
  six blobs instead of one gitlink. With the nested repo present
  `git add -A` **exits 0** and stages mode **160000**: the six files
  never become blobs, a clone gets an EMPTY directory, no `.gitmodules`
  means `git submodule update` cannot recover it, and — because the
  amendments were uncommitted INSIDE it — the pointer would have named
  the version WITHOUT them. The one file this project had just amended
  would have been the one file the commit did not contain.
  Provenance, read out of `.git/logs/HEAD` before the delete: cloned
  from **https://github.com/nai0om/buddhist-method**, branch `main`, at
  commit **745caa74ef27fce7c57cbdbf27af5add3de884d7**, on
  **2026-05-11T18:25:33+07:00**, and **never fetched afterwards** — the
  reflog holds exactly one entry, the clone, and no `FETCH_HEAD` ever
  existed. Upstream tracked exactly the six files that remain, no more.
  The local copy has **DIVERGED**: `SKILL.md` alone, 27 insertions and
  3 deletions, which are the five amendments recorded above. `LICENSE`
  (MIT) stays in place beside the files it covers. **This is a fork
  now, and the record of what it forked from lives here because the
  directory that held it does not.**
  **RESOLVED 2026-08-08 FOR `agents/` AND `skills/` — THEY ARE IN
  GIT.** `.gitignore` now reads `.claude/*` with `!.claude/agents/`,
  `!.claude/skills/` and `!.claude/settings.json`, and **the `*` is
  load-bearing**: under a plain `.claude/` every negation is INERT,
  because git never descends into an excluded directory to read one.
  Measured in a throwaway repo — all four probe paths came back decided
  by line 1, and `git add -A` staged nothing beneath it. **15 files,
  102,940 bytes, all mode 100644, no gitlink.** The invisibility this
  entry opens with is closed for those two directories: `git log`,
  `git blame` and a diff reach them, and a red-team pass can now be
  handed them. **They were renormalised in the SAME commit**, because
  `git add` strips CRLF from the BLOB at once while leaving the working
  tree alone, and the warning it prints is about a future checkout —
  718 CR bytes over 8 files, two of which are cited by byte count in
  `CLAUDE.md § Workflow`, where tracking without renormalising would
  have left the tripwire false by exactly the amount normalised.
  **`settings.local.json` STAYS OUT, and `.claude/*` excludes it with
  no extra rule.** Four reasons, all present in the file: ABSOLUTE
  MACHINE PATHS (`E:\recycle-online\server\.venv\Scripts\python.exe` in
  nine grants, plus `/e/...`, `E:/recycle-online-backups/...` and a
  `PYTHONPATH` of `E:\recycle-online\server`); a DEV CREDENTIAL on line
  20 (`recycle_app:app_pw_dev@localhost:5544`), which committing would
  make permanent and uneditable out of history; DEAD PER-SESSION GRANTS
  (line 18 admits reads under a scratchpad UUID whose session ended;
  lines 4-5 name `device/metro.config.js` when this project's client is
  `mobile/`); and STANDING TRUST rather than configuration, which is
  its own entry below. `.claude/settings.json` does not exist yet — the
  negation is written for it in advance and admits nothing today.
  **CORRECTED 2026-08-08, BESIDE THE DATED FIGURES ABOVE AND NOT OVER
  THEM.** Four things asserted earlier in this entry are false as of this
  measurement. Metis found all four on its first dispatch.
  **(1) The nine `SKILL.md` files are 74,026 bytes, not the 74,342
  recorded above. (2) The `references/` pair is 8,689 bytes, not
  8,846.** Both are the class this project tracks: a number measured
  under one definition and quoted under another. `79b1e75` renormalised
  those files from CRLF to LF, and `280580b` — which wrote the figures —
  came AFTER it, so both were stale the moment they were recorded. The
  references delta is **157 bytes against 157 LF lines** — one CR per
  line, which matches that cause exactly. The skills delta is
  **316** and does NOT decompose cleanly across the nine files;
  there is no pre-renormalisation blob to check it against, so the cause
  is consistent but UNVERIFIED and is left that way. Both new figures were
  measured from the working tree in the same process that wrote this
  paragraph — which is the discipline the two wrong numbers lacked.
  **(3) "`.claude/settings.json` does not exist yet" is false** — it
  exists, is tracked, and registers two `PreToolUse` hooks.
  **(4) "`Metis`, `Hephaestus` and `Nemesis` have no design anywhere in
  this repository" is false** — `.claude/agents/hephaestus.md` and
  `.claude/agents/metis.md` exist and are tracked. Nemesis alone is still
  undesigned.
  **A KNOWN SEAM, recorded and NOT resolved, because resolving it is a
  decision.** A plan may legitimately specify
  `git show HEAD:<path> | wc -c`, where the PRINTED NUMBER is the
  observable and the exit code belongs to `wc`. `.claude/hooks/pipe_gate.py`
  would refuse that exact form if the left side were a check rather than
  `git show`. Neither rule is wrong: the gate is right that a check's
  status must not be decided by a pipe, and the plan is right that a byte
  count read off stdout is not a status. They meet at commands that both
  produce a number AND carry an exit code, and nothing here decides which
  wins.
  *Not done:* seven of the nine are undecided and have still never been
  read by the owner, and the `references/` pair is unreconciled. Two
  are decided, amended and committed; all nine are now VISIBLE to a
  reviewer, which is a different thing from having been reviewed.
  *Unblocks:* an owner decision PER SKILL — keep, amend or delete — for
  the remaining seven, and a home for the role-over-preload rule above.
  `settings.local.json` is settled: it stays out.
- **`settings.local.json` pre-approves `git commit`, while `CLAUDE.md`
  says nothing commits until the owner confirms. Both are in force —
  FOUND 2026-08-08.** Three of its 51 grants are `Bash(git add *)`,
  `Bash(git commit *)` and `PowerShell(git *)`. The rule they sit
  against is `CLAUDE.md § Workflow` "Do not commit until the owner
  confirms", restated in `START_HERE.md § 2` as the owner being "the
  only one who confirms a commit" and a third time in that file's
  done-checklist. **Neither mechanism is wrong on its own, and they
  disagree about what happens next.** The grant removes the permission
  prompt — the one artifact that would physically put a commit in front
  of the owner BEFORE it exists — and leaves the rule enforced only by
  a session choosing to obey it. This project's own instinct is the
  opposite: hard rule 2 says enforce at the lowest layer available,
  "not by remembering in each handler". **The asymmetry is the finding.**
  The rule is prominent and the grant was unreadable by every reviewing
  role until today, so a reader who checks finds the rule and concludes
  it is enforced. The file is still untracked by design, so this entry
  is the only place the disagreement is visible. *Not done:* nobody has
  decided which way it resolves — drop the two `git` grants and let the
  prompt return; keep them and say plainly in `CLAUDE.md` that the rule
  is honour-only; or narrow them, `git add` yes and `git commit` no.
  *Unblocks:* the owner's answer. Dropping them costs one prompt per
  commit and nothing else.
- **`CLAUDE.md` and `ROADMAP.md` disagree about what a forward step is
  even CALLED — FOUND 2026-08-08.** `CLAUDE.md:67` says "Forward steps
  are **R-numbers**, defined in `ROADMAP.md` and nowhere else."
  `ROADMAP.md:35` says "**The R-numbers R1-R10 are a CLOSED LOG. No new
  R-number will be issued.**", and `ROADMAP.md:41` says "**Forward steps
  are P-numbers**". Both files are in the boot path, `CLAUDE.md` is read
  FIRST, and it points at the file that contradicts it. **This is not
  cosmetic: it is a pointer a booting session follows to learn what the
  next step is even called**, so a session that reads `CLAUDE.md` and
  stops will ask for an R-number that will never be issued. Found by
  Metis while planning something else and correctly declined as out of
  scope; an outside review reached the same defect independently, which
  is two arrivals at one line. *Not done:* nobody has decided which
  document is authoritative for numbering. The fix is one line in
  whichever loses, but it is a change to the BOOT PATH and gets its own
  phase. *Unblocks:* the owner naming the winner.
- **RE-OPENED 2026-08-08: "a tenant's first-ever counter is unguarded"
  was accepted as a bounded cost, and what it actually costs is a shop
  that cannot trade for up to a year.** The accepted reading was that an
  unguarded first bill takes a wrong `be_year` and the numbering looks
  odd. Nemesis traced it forward on its first dispatch, from the diff
  alone and with none of this disclosed to it. The full path: a shop's
  FIRST-EVER bill is written while the server clock reads a year ahead —
  the case `bills.py:484` lets through, because it guards only when
  `max_year is not None`, and the case migration 0008 states it "does NOT
  catch, and it cannot". `doc_no_counters` now holds 2570 and nothing for
  2569. The clock is then corrected, by NTP or by an operator running
  `reset_clock_watermark.py` after the clock guard trips. Every
  subsequent `POST /bills` evaluates `be_year != max_year + 1` as
  2569 != 2571 and returns **409 `be_year_not_contiguous`, tenant-wide,
  for every device, until the real calendar reaches BE 2570** — with no
  override, because `bills.py` says "deliberately no override yet". Cash
  keeps leaving the till and no bill is recorded. **The comment at
  `bills.py:493` states the cost of the OPPOSITE direction only** (a
  counter reopening at max+2), so the file documents the cheaper half of
  the trade and not this one. **What makes it new is the composition:**
  the year gate did not exist when the first-ever-counter gap was
  accepted. Before it, a clock excursion cost a numbering oddity and the
  shop kept trading; after it, the same excursion — once CORRECTED —
  stops the shop trading. Note also that a jump of exactly +1 year is
  invisible to both guards, since `be_year == max_year + 1` is the
  contiguous case the gate permits and a FORWARD jump never trips a
  backwards-only watermark. *Not done:* nothing is changed. This is an
  entry, not a fix. *Unblocks:* an owner decision on whether the accepted
  cost is still acceptable now that it is known to be this one — and, if
  not, what an override looks like, which is a design question and not a
  patch.
- **A STANDING TENSION BETWEEN TWO GOOD HABITS, and it is not resolved
  here — FOUND 2026-08-08, reported by Nemesis about ITSELF, unprompted.**
  `RED_TEAM.md:21-26` says a reviewer who reads the author's reasons
  inherits the author's model of why the code is correct, and that not
  having it is the red team's only advantage. The dispatch that produced
  the findings above was clean: no phase brief, no commit message, no
  conversation. **The author's model arrived anyway, inside the artifact
  under review.** This project comments its reasoning at the site, at
  length — `server/app/bills.py:430-470`, `server/app/clock_guard.py:1-40`,
  `server/migrations/versions/0008_server_clock_watermark.py:1-90` — and a
  reviewer reading the files a diff touches, which `RED_TEAM.md:19`
  REQUIRES, reads all of it. **No dispatch discipline can prevent this and
  no mechanism can detect it.** Both habits are good ones: a comment
  explaining why a line exists is how this repository stops relearning
  things, and a review that has not been told why is how it catches what
  the author could not see. They are in direct conflict and the conflict
  has no clean side. *Not done:* deliberately nothing. A resolution
  written today would be a preference dressed as a finding. *Unblocks:*
  the owner's thinking, unhurried. Note for whoever picks it up: Nemesis
  found the defects anyway, so the leak degraded the pass without
  defeating it, and that is one data point rather than a general result.

  **AMENDED 2026-08-17 — THE TENSION NOW HAS A SIZE, AND A REASON IT
  CANNOT BE FIXED BY A BETTER EXCLUSION LIST.** The entry above argues
  qualitatively and names three server files. Measured on the MOBILE side,
  which is where P1.18's diff will land, by
  `grep -cE '^[[:space:]]*(//|/\*|\*)'` over `wc -l`, and by an `awk` count
  of comment blocks of five lines or more — five lines being a paragraph
  rather than a label:

  | file | comment lines | blocks >=5 lines |
  |---|---|---|
  | `mobile/src/sync/types.ts` | 494/667 (74%) | 41 blocks, 462 lines (69%) |
  | `mobile/src/sync/outbox.ts` | 193/290 (67%) | 18 blocks, 183 lines (63%) |
  | `mobile/src/sync/engine.ts` | 410/756 (54%) | 28 blocks, 367 lines (49%) |
  | `mobile/src/adapters/sqlite/schema.ts` | 322/564 (57%) | — |
  | `mobile/src/adapters/sqlite/SqliteLocalStore.ts` | 566/1086 (52%) | — |

  The 73-second ordering incident is at `mobile/src/sync/engine.ts:321`, in
  the comment on the loop it explains.

  **THE FIGURE IS AN UPPER BOUND AND NOT A MEASUREMENT OF CONTAMINATION,
  and saying so is the point of recording it.** A five-line paragraph
  describing what a field MEANS is API documentation, not the author's
  model of why a change is correct. So "block of five or more lines" is a
  proxy for "paragraph", which is in turn a proxy for "argument". The
  conclusion survives as a DIRECTION rather than a value — at half the
  bound it is still several hundred lines against the 99 a criteria review
  reads — and it is written here as a direction.

  **HOW THAT CAUTION WAS ARRIVED AT, because the shape is the finding.**
  The first instrument counted comment lines containing `deliberate`,
  `because`, `measured`, `hard rule`, and was DISCARDED for measuring
  lines-with-a-word rather than paragraphs-of-reasoning. The replacement
  was better and **inherited the same flaw one level up**, and nobody
  noticed until somebody asked what the NEW tool measures a proxy for.
  Changing an instrument feels like the repair, and that feeling is what
  stops the second question from being asked. Ask it of every replacement.

  **THE GENERAL RESULT, which the entry above says it did not have.** A
  fixed exclusion list rots STRUCTURALLY rather than through carelessness.
  Closing a finding means recording the reason it was closed, so every
  closure widens the set of documents holding the argument. This very
  amendment does it: the entry above named three server files, and the
  set now also contains `mobile/src/sync/outbox.ts`,
  `mobile/src/sync/engine.ts` and `OPEN_ITEMS.md` itself. **So a dispatch
  should carry a SCOPE and not an exclusion list** — the two overlap, and
  the exclusion list is the one that is both redundant and incomplete,
  because a reader told "do not read X" infers that Y is permitted.
  Measured the same day: a dispatch scoped to `mobile/` already excluded
  every root document, and the exclusion of `ROADMAP.md` written beside it
  added nothing while implying `OPEN_ITEMS.md` was fine — where
  `OPEN_ITEMS.md:2463-2464` carries P1.18's argument nearly verbatim.

  **WHAT THE MEASUREMENT UNLOCKS, AND IT IS NOT A RESOLUTION.** The entry
  above says no mechanism can detect the leak. There is now a way for a
  pass to measure it ON ITSELF: the comment ratio of the files it read,
  reported as a number in its own findings. That is not a rule and not a
  fix; it is an observation a pass can make about its own conditions, and
  it turns "this reviewer was contaminated" from an assumption into a
  figure with a named instrument.

  *Not done:* unchanged, and deliberately. A resolution written today would
  still be a preference dressed as a finding. The measurement does not
  resolve the tension — it gives it a size, and that size has an upper
  bound rather than a known value.
- **NOTHING ANYWHERE LIMITS REPEATED ATTEMPTS — A WHOLE-SYSTEM GAP, AND IT
  IS FILED AS ONE ON PURPOSE. Recorded 2026-08-10.** No throttle, no
  backoff, no attempt counter, no lockout-after-N and no record of a failed
  attempt exists at any endpoint in this API. **Login is included, not
  excepted** — it is simply the endpoint people think of first.
  **WHY THIS IS AN ITEM RATHER THAN A LINE IN SOMEBODY ELSE'S ENTRY.** Until
  today the absence was written down in three places and every one of them
  framed it as a property of ONE endpoint or of one file's survey:
  `SRS_MAP.md § 6. Security posture, per area`
  "No rate limiting, no lockout, no failed-login record." records it as a
  finding in a file that says in its own words that it decides nothing;
  `ARCHITECTURE.md § 10. The three settled decisions` D4 carries it as a
  bullet about `POST /auth/shop-code`; and
  `ROADMAP.md § P1.3 — What identifies a shop at login` repeats that bullet
  as one of the things still absent from that step. **Three per-endpoint
  framings of a system-wide gap is how it gets closed once and believed
  handled**: somebody adds a limiter to login, or to the shop-code lookup,
  and every other route is still unguarded while three documents now read as
  though the question were answered. The shape of the fix has to be decided
  before any endpoint gets one — middleware, a dependency, or a store
  outside the process — because those are not the same change.
  **A KEYSPACE IS NOT A RATE LIMIT**, and the argument is already written
  where it is most likely to be misread: migration `0009`'s
  `31^8` arithmetic is a cost paid for legibility, not a defence, and it
  bounds guessing per attempt while bounding nothing about the number of
  attempts. D9's minimum-length rule has exactly the same limit for the same
  reason. *Not done:* nothing has been decided, designed or built, and this
  entry changes none of that — it moves WHERE the absence is recorded so
  that fixing one endpoint cannot look like fixing the system. *Unblocks:*
  the owner deciding whether attempt limiting is in scope before a shop
  trades, which is also a hosting question (`R3`/P1.2 puts the API on the
  public internet, and today it is on a LAN).
  **WIDENED 2026-08-10 BY `cb11f6a`, AND THE WIDENING IS THE POINT RATHER THAN A
  FOOTNOTE.** `POST /users/me/password` takes a CURRENT password and refuses a
  wrong one with a plain 400. That refusal is correct and was argued: the caller
  already holds a valid token for that exact account, so nothing about the
  account's existence is disclosed by answering plainly. **What it adds is a
  SECOND place in this API where guessing a credential is free** — unlimited
  tries, no counter, no record that any were made, and this one behind a session
  rather than in front of it, so a borrowed unlocked handset is the threat rather
  than a stranger on the internet. The route's own docstring says the limiting
  question is a whole-system gap recorded here rather than something to invent at
  one route; this line is that record catching up. **Nothing about the route
  changes if a limiter arrives** — it is a decision about where attempts are
  counted, not about what the 400 means.

- **P1.13's DONE WHEN WILL REDDEN OVER A CORRECT DESKTOP, BECAUSE ITS INSTRUMENT
  READS COMMENTS.** Found 2026-08-19. RECORDED, NOT REPAIRED; `ROADMAP.md` was
  outside this phase's declared file set and NOTHING BELOW IS AUTHORISED.

  `ROADMAP.md § P1.13 — The desktop scaffold` requires that
  `git grep -n "543" -- desktop/` return exit 1, and the step says why: the whole
  point of P1.12 is that this number appears in one place in the system.
  **`git grep` searches FILE CONTENT and knows nothing about comments**, so the
  criterion is satisfied only by a desktop that never writes the digits down —
  including in a sentence explaining why it holds no second derivation.

  **MEASURED IN THIS PASS, AND TODAY IT PASSES BY BEING EMPTY.**
  `git grep -n "543" -- desktop/` exits **1** over a directory whose only tracked
  file is `desktop/.gitkeep` — `git ls-files desktop/` returns that one path. So
  the criterion currently measures nothing: there is no state of a correct desktop
  it has ever distinguished from an incorrect one.

  **THE CONTROL IS ONE DIRECTORY AWAY AND IS THE WHOLE ARGUMENT.** The same
  instrument over `packages/` returns ten lines and exits 0. Exactly ONE of them
  is a derivation — `packages/shop-time/src/shopTime.ts:70`,
  `export const BE_YEAR_OFFSET = 543;` — and the other nine are prose: the
  package's own `description` field, and comments at `:48`, `:61`, `:73`, `:75`,
  `:80`, `:81`, `:166` and `:181` that exist BECAUSE this derivation has been got
  wrong before. That is precisely the shape a correct desktop will have. The
  sentence its author is most likely to write is the one the constraint invites —
  `SRS_MAP.md § 7c. Printing — nothing exists, and it may not be a late item`
  records that the shared module carries a NEXT CONSUMER block naming the desktop
  thermal slip, and the desktop's job is to IMPORT rather than re-derive. **A
  developer who does the right thing and says so in a comment turns the step's
  DONE WHEN red.**

  **SAME CLASS AS THE COUNT-IN-A-CRITERION ENTRY EARLIER IN THIS SECTION, AND NOT
  A DUPLICATE OF IT** — that one is a criterion whose NUMBER stops describing the
  set; this is a criterion whose INSTRUMENT cannot express what it means. Both are
  a sentence this project uses to decide a step is finished, going wrong with
  nothing to announce it, which is why they belong beside each other rather than
  in one entry. The repair forms that entry lists do not reach this one: no
  anchoring, naming of the set, or single-site confinement makes `git grep`
  distinguish a comment from an assignment.

  *Contradicts:* nothing — the criterion is right about its intent and wrong about
  its measurement. *The decision owed:* whether the criterion names a stricter
  instrument (one that reads the module graph, or an assignment rather than a
  substring), or whether the desktop is simply required not to write the digits
  anywhere including prose, which is a real cost paid by the next reader of that
  code. *Not done:* neither. *Unblocks:* nothing built — it stops P1.13 being
  argued about on the day it is otherwise finished.

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

## Schema requirements raised by the 2026-08-17 legal research round

**THE SOURCE IS A CLUE, NOT A SOURCE, AND ITS LIMITS TRAVEL WITH EVERY LINE
BELOW.** These came from one research round on Thai statutory obligations. Four
things are wrong with it as evidence, and none of them is a reason to discard
it — they are the reason nothing here may be built from it without a second
opinion:

- **(i) Its confidence column measured nothing.** All eleven of its answers are
  rated "high confidence", including one whose own text says it rests on
  interpretation. A rating with no variance carries no information.
- **(ii) Its most architecture-changing conclusion carries no direct
  citation.** That after five years the duty FLIPS from keeping the record to
  deleting it is a SYNTHESIS of two statutes, not a quotation from either.
- **(iii) Its source list includes documents with no apparent relation to the
  subject**, so citations were keyword-matched rather than all resolved.
- **(iv) IT NAMES A DISTRICT AND PROVINCE THAT WERE NOT IN THE QUESTION PUT TO
  IT**, and cites a local ordinance for that place. Whether the owner supplied
  the location separately is **UNCONFIRMED** — he was asked and has not
  answered. **The local-ordinance material is therefore UNVERIFIED and is
  recorded as unverified, never as fact.**

**THE CLASSIFICATION BELOW IS THE POINT**, because the report itself grouped
all five as if equally binding, and they are not: two are asserted as legally
required, one is a business capability with no legal force, one is a foundation
with no feature of its own.

- **SHOP IDENTITY FOR THE SLIP — tax id, address, licence number.** `tenants`
  is `(id, name, created_at)` and nothing reads it. **LEGALLY REQUIRED** per
  the cited revenue-code section. *Not done:* there is no column, no route and
  no screen for any of the three. *Unblocks:* it EXTENDS P1.16, whose scope was
  previously understood to be name and address only — so P1.16 is wider than
  its own entry says. **Why it matters here:** a slip that must carry a tax id
  cannot be printed from a table that has no field for one, and P1.17 prints
  from P1.16.
- **ITEM TRACKING ID / SERIAL PER BILL LINE.** **LEGALLY REQUIRED** per the
  cited second-hand goods act section — **BUT whether it binds BULK SCRAP SOLD
  BY WEIGHT, as opposed to identifiable second-hand items, is OPEN.** *Not
  done:* `purchase_bill_items` has no such column, and the question of whether
  the duty even reaches this business is unanswered. *Unblocks:* the licensing
  officer. **Why it matters here:** if it binds, it is a per-line column on the
  one table hard rule 5 forbids rewriting, so it is cheaper before the pilot
  than after it.
- **PDPA RETENTION — deleting a seller's personal data without touching the
  money.** *Not done:* the mechanism does not exist. **The STRUCTURE already
  permits it**, and that is worth stating plainly because it is the expensive
  half: `sellers` is a separate table and `purchase_bills` holds only
  `seller_id`, so the personal data can be removed while every bill keeps its
  amounts, its doc_no and its history. What is missing is the mechanism, not
  the shape. *Unblocks:* **confirming the five-year synthesis with a
  professional before anything is built** — see (ii) above; a deletion
  mechanism built to a wrong deadline destroys records it was required to keep.
- **LUMP-SUM PURCHASE — NOT LEGALLY REQUIRED.** The report found no
  prohibition. It is a **BUSINESS CAPABILITY** the product must offer because
  the system is sold to many shops and each runs differently (S6). *Not done:*
  every bill line is weight × price. *Unblocks:* the per-tenant settings home
  below, since this is a mode a shop turns on. **THE CONSEQUENCE, AND IT IS THE
  part that will be missed:** `reconcile.py` recomputes
  `round(net × price, 2)` and compares it to `amount`, so a lump-sum line would
  be reported as a **violation on every run** unless the checker learns the
  mode — and teaching it must duplicate the ARITHMETIC without duplicating the
  CONVENTION (`lessons/README.md § Lessons` "DUPLICATE ARITHMETIC").
- **A PER-TENANT SETTINGS HOME — the FOUNDATION the other four hang from, not a
  fifth feature.** Measured 2026-08-17: **thirteen tables, none of them a
  settings table**, and `tenants` has three columns. *Not done:* there is
  nowhere to store what a shop has toggled. *Unblocks:* nothing else can start
  properly — the owner's directive is that every capability SHIPS and each shop
  toggles it, which is a claim about storage before it is a claim about
  features. **Why it matters here:** built late, every capability added before
  it invents its own private place to keep a flag.
- **`sellers` HAS NO `created_by`, while `purchase_bills` has carried one since
  migration 0006.** NOT from the research round — found by P1.8a, the phase
  that widened it. After P1.8a a shop can add sellers from the yard floor and
  **nothing records who did it**. *Not done:* reported, not fixed. *Unblocks:*
  a migration and one column; the gate change that made it reachable has
  already landed.

## Documentation

- **THE CITATION CHECK MUST BE THE LAST COMMAND BEFORE THE COMMIT MESSAGE, AFTER
  EVERY DOC EDIT — recorded 2026-08-31, and it rode a defect into `ad2806e`.** The
  P1.24 commit-1a citation check read `BROKEN=6` (the floor), then a LATER doc edit
  — the untracked-`0015` Code-debt line, added in the pre-commit tasks — introduced a
  seventh broken citation, and 1a was committed WITHOUT a re-check. So `ad2806e`
  carries `BROKEN=7`, undetected until commit 1b re-ran the checker. A SEQUENCE
  defect, not a typo: a citation check is a measurement that ROTS the moment a later
  edit lands (`CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT"), so run it AFTER
  every doc edit, as the LAST command before the commit message is written, and QUOTE
  its `BROKEN` reading in the commit body. Commit 1b returns the named 14-file list to
  the floor (`BROKEN=6`, the broken handle removed). Recorded HERE, not in `CLAUDE.md`'s
  machine-footgun home: this is a workflow / measurement-staleness discipline, not a
  trap specific to this box (Two homes, one test), and `CLAUDE.md` is out of bounds this
  phase — so the operator running the checker meets the rule where the queue lives.
- **`ARCHITECTURE.md`'s TABLE-AND-RLS COUNTS OUTSIDE § 4 ARE STALE — found
  2026-08-31 (P1.24, migration 0015), NOT REPAIRED.** P1.24's brief scoped the
  ARCHITECTURE edit to § 4 (superseded in place: the count, the two grade CHECK
  cells, the new `grade_tiers` row). The same counts recur OUTSIDE § 4 and are now
  wrong: § 2.1 "10 business tables" and the `server/` row's "5 migrations applied";
  § 8.1 rule 2 "all 10 tables"; § 8.2 "policy, 9 tables" / "the 10th table" and
  "the ten FORCE-RLS business tables". Re-derived on dev 2026-08-31 (reconcile S1/S3):
  `public` holds FOURTEEN relations, THIRTEEN business tables, and TWELVE carry FORCE
  RLS with a policy ("12 of 12"). These were ALREADY stale before 0015 — `0012` added
  a FORCE-RLS business table (`seller_code_reservations`) that none of them counts — so
  0015 aggravates a pre-existing gap rather than creating it. Not repaired: the brief
  scoped § 4 only, and correcting the § 8 enumeration is a-quantified-sentence work
  `0012` owed. Recorded so a reader of § 8 is not misled. (Line numbers drift; re-derive.)
- **`lessons/proof-must-run-twice.md`'s FIFTH amendment says `prove_reconcile.py`
  "has been red ever since" the 2026-08-03 rebuild — that claim is now STALE.
  Found 2026-08-30, NOT REPAIRED.** Re-measured this pass, twice with no reseed:
  `python scripts/prove_reconcile.py --from <fresh 0013 backup> --database recycle_recon_scratch`
  exits 0 both times (failures: 0, skipped: 1 — the normalise claim, correctly
  skipped over a clean backup). The tenant-count expectations the amendment names
  as hardcoded (46, `T0`=91) are DERIVED AT RUNTIME now — the run prints "tenants
  in copy: 4 ... derived from this number, at runtime". Not repaired here:
  correcting a lesson's amendment is not a lesson this phase owed; recorded so a
  reader trusting "red ever since" is not misled.
- **`CLAUDE.md § Machine footguns` SAYS `lessons/README.md` IS THE ONE FILE IN
  `lessons/` WHOSE WORKING-TREE COPY CARRIES CRLF. THAT CLAUSE IS NOW FALSE.
  Measured 2026-08-25 at the P1.8b MOBILE boundary. `CLAUDE.md` and `EVIDENCE.md`
  were OUT OF BOUNDS for the phase that turned it, so this is the queue entry and
  not the repair.**
  **THE NUMBERS, EACH NAMED TO THE OBJECT IT DESCRIBES**, which is the rule that
  entry itself gives and the one everybody editing the passage has disregarded.
  Working tree, bytes on disk: **CR=0**, LF=66. Blob at `1d7f638`,
  `git cat-file blob` captured as BYTES and counted there: **CR=0**, LF=66. BOM,
  first three bytes of both: **`efbbbf`, present**. Counted with
  `tr -cd '\r' | wc -c`, which was checked against a file known to carry CRLF and
  returned 2 there — a `grep -c $'\r'` form was tried first, returned the FILE'S
  LINE COUNT on both files, and was discarded as a broken instrument rather than
  believed.
  **THE MECHANISM IS NOT IN DISPUTE AND THE ENTRY IS NOT WRONG ABOUT IT.** The
  cause was a `git stash push` / `git stash pop` — a CHECKOUT — and `.gitattributes`
  `eol=lf` makes a checkout write LF, which is exactly what that same entry says a
  checkout does. What has rotted is a PRESENT-TENSE clause about a working-tree
  artefact, which is the pin-a-claim convention's own case: the sentence was true
  when written, nothing announced that it turned, and the entry's reasoning
  survives it intact.
  **THE BLOB NEVER CHANGED AND THERE IS NO DAMAGE TO REPAIR.** `text=auto`
  normalises on the way into the index, so this path's blob has never held a CR —
  0 before, 0 after — and the diff over the change that observed this is one
  insertion and one deletion, the index line, with no line-ending noise. Nothing
  is to be restored, re-normalised or reverted; the working tree simply now agrees
  with `.gitattributes` where before it did not.
  **THE EXCLUSION OF `README.md` FROM `all-lessons.md` IS NOT TO BE REMOVED, AND
  THIS IS THE HALF MOST LIKELY TO BE GOT WRONG NEXT.** That entry gives the
  exclusion TWO reasons — it is the INDEX rather than a lesson, and it is the only
  source that would drag a BOM and CRLF into the generated file — and warns in its
  own words against removing it on the strength of refuting one. **Exactly one has
  just been refuted.** The index reason is untouched, and the BOM half is MEASURED
  INTACT at `efbbbf` in both objects, so the generator would still pull a BOM in.
  Whoever reads the CRLF clause next will reach for that exclusion; this sentence
  exists to stop them.
  **AND A CONTROL THIS REPOSITORY USES IS NOW DEAD.** `lessons/README.md` was the
  positive control for the CR-aware / CR-blind reader distinction — the file you
  point an instrument at to confirm it can SEE a CR before trusting it to report
  their absence elsewhere. With CR=0 in both objects, every such instrument now
  returns the same answer on it, so the two can no longer be told apart there and
  a run using it learns nothing while looking exactly like a run that did.
  **A REPLACEMENT CONTROL IS OWED AND NONE IS NAMED HERE** — choosing one is a fix,
  and a fix inside a queue line is how a decision gets taken by whoever was
  writing rather than by whoever owns it.
  **WHERE THE REPAIR GOES.** A later phase that has `CLAUDE.md` in scope, together
  with the CP874 crash already queued for that same section, so the entry is
  opened once rather than twice.

- **NOTHING AT A PHASE BOUNDARY RUNS `build_all_lessons.py --check`, AND THE FILE
  IT GUARDS WAS MEASURED STALE.** Found 2026-08-18. `START_HERE.md § 4`'s Commands
  table lists the typechecks, the `prove:*` scripts, the server proofs,
  `reconcile.py` and `verify_shared_checks.py`, and does NOT list this one — so the
  only thing that regenerates `lessons/all-lessons.md` is a session that happens to
  remember. Measured at `e6249f6` with `git show`:
  `lessons/console-is-not-the-observation.md` carries its P1.12 amendment there and
  `lessons/all-lessons.md` does not, one hit against zero, with the banner reading
  `20 across 10 files` against sources holding 21 across 11. `--check` would have
  exited 1 at that commit and nothing asked it to. NOTHING BELOW IS AUTHORISED.

  **It is the cheap half of the entry below and not a duplicate of it.** That one is
  a control that cannot go red; this is a check that CAN go red and is never asked.
  The failure is quieter than it looks: a stale generated file is not wrong about
  anything it contains, it is merely missing what it has not been told, so every
  reader of it gets correct text and an incomplete corpus. *Contradicts:* nothing —
  it is an omission from a checklist. *The decision owed:* whether
  `build_all_lessons.py --check` joins the Done table, or whether the generated file
  is regenerated by whatever writes a lesson and the check stays on demand.
  *Not done:* neither; `START_HERE.md` was outside this phase's declared set.
  *Unblocks:* nothing built — it stops a generated document drifting from its
  sources for a whole phase without anything noticing.

  **CLOSED 2026-08-19 BY P-SAASGAPS, ON THE FIRST OF THE TWO OPTIONS.** The
  brief of that date instructed the Done-table row, so `START_HERE.md § 4` now
  lists this check beside the typechecks and the proofs. **The second option was
  not weighed here and was not rejected on its merits** — leaving the generated
  document to whoever writes a lesson, with the check on demand, is still a
  coherent answer and simply was not the one instructed. **What the row does NOT
  do:** nothing runs it, any more than anything runs the typechecks listed beside
  it; it is a checklist a session reads at a boundary, which is the delivery
  mechanism this repository has measured going unopened. The staleness measured
  above stands exactly as written.

- **`tools/verify_citations.ps1` CANNOT PARSE A CITATION WHOSE TARGET FILENAME
  CONTAINS A HYPHEN, WHICH IS EVERY LESSON FILE — AND SUCH A CITATION IS NOT
  REPORTED BROKEN, IT IS NOT REPORTED AT ALL.** Found 2026-08-18 by writing one:
  the checker's own count went up by three where four citations had been added,
  and the missing one named a lesson file. The mechanism is the filename class in
  both parsers, `[A-Za-z0-9_/.]` with no `-`, so the match fails at the first
  hyphen and the citation is never seen. NOTHING BELOW IS AUTHORISED; `tools/` was
  out of bounds to the phase that found this.

  **IT FAILS BY MEASURING LESS, WITH NO SIGNAL** — this repository's oldest
  failure shape, and the one the checker's own header was written to defend
  against for a different cause (`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md").
  BOTH of the checker's positive controls stay green: the sections control counts
  only citations the same class already matched, so a citation it cannot see is
  absent from the expected number as well as from the parsed one, and the
  non-empty control passes on any source with at least one parseable citation.
  **The two controls cannot fire on this**, which is why it survived to be found
  by arithmetic rather than by a red.

  **MEASURED TWICE, INDEPENDENTLY, MONTHS APART — AND THAT IS THE REASSURING HALF
  AND THE ARGUMENT FOR THE PRIORITY AT ONCE.** At `bcd4d40` it was measured from
  the other direction: hyphenated `.md` paths inside backticks across the
  then-checked sources numbered **129**, and in genuine citation form — a path
  followed by the section mark — the count was **ZERO**. That figure is recorded
  here at the commit it was taken at and was deliberately NOT re-taken. At
  `e6249f6`, on a tree carrying no modified tracked path, a second pass over the 25
  tracked documents that cite into `ROADMAP.md`, `OPEN_ITEMS.md` or
  `PROJECT_STATUS.md` parsed **435 citations naming 14 distinct target files, not
  one of them hyphenated**; a search of those same 25 for a citation-shaped
  reference to a hyphenated `.md` returned exactly ONE hit, and it was the one this
  phase had just written and has since re-pointed at the index.

  **SO THIS IS A DEBT THAT CAN WAIT, AND THE TWO MEASUREMENTS ARE WHY.** Two
  independent discoveries of one latent defect, months apart, neither of which cost
  anything, is evidence about its RATE and not merely about its severity: no
  standing citation is going unchecked today, because every document here reaches a
  lesson through `lessons/README.md`, which has no hyphen. What is unchecked is the
  FORM — nothing says that route is required rather than customary — and a form is
  not an outage. **It is not urgent and it is not closed**; the reason to fix it is
  that its cost the day it is not latent is a green run over a pointer nobody
  opened, and by then the habit has been copied. The MECHANISM behind it is
  recorded separately and does not wait on the fix:
  `lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md",
  fifteenth mechanism.

  **WHY THAT IS A WORSE STATE THAN A BROKEN CITATION, not a better one.** A broken
  citation is loud and gets fixed. This is a rule nobody knows exists: the next
  writer to cite a lesson directly — the obvious, more precise thing to do — gets
  a green run over a pointer the instrument never opened, and every later reader
  sees a citation in the checked shape and reasonably believes it was checked.
  *The decision owed:* widen the class to include `-` and re-run to see what the
  checker has been unable to see, or state in the checker's header that lessons
  are cited through the index BY DESIGN and make a direct lesson citation a named
  refusal rather than a silence. *Not done:* neither; `tools/` is code and this
  phase was documentation only. *Unblocks:* nothing built — it removes a way for a
  green citation run to be quietly narrower than the corpus it claims to cover.

- **The cluster inventory in `PROJECT_STATUS.md`'s `2026-08-09 — the directory role`
  entry is STALE, and is deliberately not being rewritten.** It records
  `alembic_version` in `recycle` as **0008** and `recycle_restore_scratch` as
  **0007**, and names neither `recycle_keyshape_scratch` nor
  `recycle_tw20260809_0009fixture`. Measured 2026-08-10: `recycle` is **0009**,
  and **four** databases carry schema `directory` — `recycle`,
  `recycle_keyshape_scratch`, `recycle_restore_scratch`,
  `recycle_tw20260809_0009fixture`. The other five (`recycle_clock_scratch` 0008,
  `recycle_recon_scratch` 0008, `recycle_lock_scratch` 0007,
  `recycle_users_scratch` 0007, `recycle_recon_pre0005b` 0004) agree with what that
  entry says. *Why it is not edited:* a dated measurement is superseded rather than
  rewritten — the rule that file already follows — and it was true when written.
  The corrected table lives in the `2026-08-10` entry. *What this queue entry is
  for:* so that a reader who reaches the older entry first learns it has been
  superseded, which the older entry cannot tell them itself. *Not done:* nothing
  cross-links dated entries in that file, and building that is a bigger change than
  this finding justifies.

- **`SRS_MAP.md`'s "Of the 34 `tenant_connection(` call sites in
  `server/app/`" is UNVERIFIED.** The line beneath it was corrected by the
  commit that records this, and the count above it was deliberately NOT
  measured while doing so — a number confirmed by silence is worse than one
  known to be unchecked. *Not done:* measuring it was outside that commit's
  scope, and fixing a number nobody has counted is how a wrong number gets
  an air of authority. *Unblocks:* one grep for `tenant_connection(` under
  `server/app/`, and either the count stands or it moves.
- **An amendment is OWED to
  `lessons/a-checker-must-not-share-the-code-it-checks.md` — the same
  shape as the original, but with a CONSTANT where that one had an
  arithmetic helper.** Found 2026-08-06 while writing `proveSignOut`.
  The lesson's existing bounds are "duplicate arithmetic, never duplicate
  a convention"; this is a third face of the same rule. S2 originally
  compared what `applyClearedSession` wrote against `CLEARED_SESSION` —
  **the object under test.** The applier reads that same object, so the
  two agree BY CONSTRUCTION: ten cells were structurally in agreement and
  **eight of them could never go red**, whatever the constant was changed
  to. Only `token` and `online` carried an assertion capable of failing.
  **Measured rather than reasoned:** all eight were then mutated in
  `CLEARED_SESSION`, one field per run, to wrong-but-plausible values —
  and every one was a TS2322 at the declaration site, so the build
  stopped and the proof never ran. **Not one of the eight literals
  fired.** The residue is what makes it worth a lesson rather than a
  fix: tsc holds those eight, so the proof's real contribution is the one
  case the compiler cannot see — the interface literal and the constant
  widened TOGETHER — plus an `Omit<>` that makes an ELEVENTH field a
  compile error until its expected value is written down. Full working is
  already recorded at `mobile/src/proof/proveSignOut.ts:273-304`; what is
  missing is the generalisation in `lessons/`. *Not done:* nothing under
  `lessons/` was edited by the documentation phase that found it, by
  instruction. *Unblocks:* writing the amendment — and with it the
  general form, that "the proof reads its expected value out of the thing
  under test" has now bitten with a HELPER and with a CONSTANT, so the
  test is the relationship, not the kind of thing shared.
- **THE LESSON DEBT, SURVEYED 2026-08-08. NINE ARTIFACTS OWED UNDER
  `lessons/`, NOT TWELVE — and the number came from a conversation,
  which is why it was checked.** Three read-only passes (Read/Grep/Glob
  only, no shell, every claim carrying path:line) checked a recalled
  list of twelve candidates against the files. **Two did not survive
  contact and are recorded below as REFUTED so they are not raised
  again.** Three collapse into one file. One genuinely-owed debt was
  not on the list at all. **The corpus stood at 36 lessons**, agreed by
  four instruments: `ls -1 lessons/*.md | wc -l` (38 raw, minus the
  index and the generated concatenation), `grep -c '^- '
  lessons/README.md`, the banner at `lessons/all-lessons.md:15`, and
  that file's TOC. The exclusion set is not a judgement —
  `server/scripts/build_all_lessons.py:75-86` defines it, and `:81` is
  the line that excludes the generator's own output from its own input.
  **(1) NEW `lessons/the-observer-is-a-writer-to-what-it-observes.md`**
  — three mechanisms of one shape: a scan that read its own command; a
  PreToolUse gate that logged the search into the medium being
  searched; a counter whose own text sat in its own denominator,
  returning an impossible negative count. Merged rather than split on
  the criterion extracted from what this corpus DID rather than what it
  says: **ONE FILE PER OPERATIVE TEST, not per mechanism and not per
  remedy.** `a-check-that-never-went-red-was-never-observed.md` carries
  nine mechanisms and fifteen distinct remedies in ONE file because all
  nine answer one question (`:174-176`); `a-differential-control-is-
  only-as-good-as-its-weaker-side.md` split off because its question
  differs (`:46-47`), and that file and the nine-mechanism one each
  declined to absorb the other, in writing. Differing remedies are
  therefore NOT evidence for splitting here.
  **Superseded 2026-08-17: ELEVEN mechanisms and NINETEEN remedies.**
  Both figures were taken when that file held nine and fifteen; the
  tenth landed at `2f88403` and the eleventh in this phase, each adding
  two remedies. **The MERGE CRITERION above is what matters and it is
  unchanged** — one file per operative test, not per mechanism and not
  per remedy. **One qualification the eleventh forces, flagged and not
  resolved:** it is the only mechanism in that file addressed to a RED
  rather than a green, so "all N answer one question" now needs the
  question stated at its widest — *did you observe the instrument, or
  trust its word?* — rather than at the narrower one this sentence was
  written under. **The `:174-176` and `:46-47` references have rotted**
  and are left as found: that file has grown from 176 lines to 794, and
  repairing position citations is a different pass from correcting a
  count. *Done when:* the file
  carries three mechanisms; the three-clause operative test (WRITERS /
  BURNT TOKENS / DOMAIN AND EXCLUDE BY IDENTITY) **with the failed
  single-clause first attempt shown rather than edited out** — the
  falsification is the argument, and the first attempt caught one of
  three; mechanism 7 marked INCIDENT NOT REPRODUCIBLE FROM THIS REPO,
  the way `a-check-that-never-went-red-was-never-observed.md:49-51`
  already marks one; a "why it is not X" section against that file's
  mechanisms 1-2, 5 and 9, against
  `a-checker-must-not-share-the-code-it-checks.md:164`, and against
  `proof-must-run-twice.md:159`; `build_all_lessons.py:76` and `:81`
  named as the remedy already working in this tree and named by no
  lesson; the mechanism count stated in exactly ONE place in the file;
  and an index line in `lessons/README.md` carrying no count.
  **Two things measured AFTER the design and owed to the file.** Clause
  1 sharpened to name the writer AND THE ACTIONS IT FIRES ON: the gates
  log SHELL CALLS ONLY — `185 ALLOW Bash, 11 ALLOW commit`, zero
  Read/Grep entries — so an agent holding Read/Grep/Glob does not
  contaminate and a session holding Bash does, and which of the two you
  are is not a detail. And the three-generations instance at
  `.claude/hooks/gate.log:211,215,216`, where `:216` is the command run
  to CHECK for `:211`, and the match count moved 4 to 5 between two
  readings with no other cause. **That instance is better evidence than
  the incident this lesson was proposed from, because it is in-repo and
  because it MOVED.**
  **LANDED 2026-08-08 in `14e94d5`**, written as specified, plus one
  improvement on the design: mechanism 3 keeps its INCIDENT NOT
  REPRODUCIBLE FROM THIS REPO marker AND gains a second instance that IS
  in-repo — `tools/verify_citations.ps1` counts the handle in the target,
  so a citation whose target is its own file counts itself and can never
  resolve. Corpus is now 37, agreed by three instruments.
  **(2) AMEND `lessons/a-check-that-never-went-red-was-never-observed.md`
  — a TENTH mechanism: the needle was well-formed and landed inside a
  LARGER TOKEN.** `grep -o 'agent_type'` returned three hits, read as
  the central question answered yes; it was matching inside
  `subagent_type`, a parameter the caller had sent. Not mechanisms 1-2:
  `:96` defines those as "vacuously true — no input exists that fails
  it", and an input that fails this one exists. **The proof it is a
  different mechanism is that the existing remedy PASSES on it** —
  `:112-113` says build needles numerically and assert their length,
  and `len("agent_type") == 10` holds while the answer stays wrong.
  *Done when:* the mechanism section exists; remedies 16-17 are
  appended to the running How-to-apply list (bound the match at the
  token boundary; run a NEGATIVE control over the confusable
  superstring in the same pass and require the specific count to exceed
  it); and the single count line is updated NINE -> TEN. That last is a
  one-number edit by construction, which is the 2026-08-08 repair
  paying out.
  **(3) NEW — a fixture encoding a premise the product moved under.**
  `mobile/src/proof/fakes.ts:645-651` comments a 503 as the poison
  shape; `reachable: true` is at `:652`, one line outside the range as
  recalled. The clock guard made 503 a condition true of EVERY bill
  (`server/app/main.py:85-92`), which
  `mobile/src/sync/engine.ts:626-628` says must never feed the per-bill
  alarm. NOT covered by
  `a-proof-fixture-must-be-a-row-the-product-could-produce.md`: apply
  its test at `:51-54` — "Could the code have made it?" — and the
  answer is YES,
  `mobile/src/adapters/httpTransport.ts:162-166` produces that exact
  shape for any 5xx. The fixture is faithful to the code and wrong
  about the requirement, and its test returns "fine". Full working
  already in the entry under Verification gaps beginning "A FIXTURE
  ASSERTS AS CORRECT A BEHAVIOUR"; not restated, and deliberately NOT
  written as a `file § Section` "handle" citation — a citation whose
  TARGET is this same file counts its own text, so it can never reach
  the exactly-one hit `tools/verify_citations.ps1` requires. *Done
  when:* the lesson names the class — a fixture states a PREMISE about
  what a status code MEANS,
  falsifiable by a change in a different repository half with no edit
  to the fixture — and says why the nine mechanisms are its inverse:
  they are cells that CANNOT go red, this is one that can and nobody
  moved it.
  **Superseded 2026-08-17: ELEVEN mechanisms, not nine** — the tenth at
  `2f88403`, the eleventh in this phase. The *Done when* above still
  stands and its wording is what needs care when the lesson is
  eventually written: **"they are cells that CANNOT go red" is now true
  of TEN of the eleven.** The eleventh is a cell that DID go red and
  reported a word covering two conditions with opposite repairs, so a
  new lesson citing this contrast must say ten, or say it of the
  mechanisms rather than of the file.
  **(4) NEW — read the spec before designing the experiment.** Two
  propagation experiments were designed to establish what one line of
  vendor documentation already states, costing over an hour. The same
  day's counter-examples — registration latency, tool restriction
  enforced by non-offering, an agent list stale in both directions —
  appear in no documentation and could only be measured. NEW rather
  than covered: `vendor` returns 0 matching lines across the corpus and
  `before designing` returns 0. *Done when:* the lesson states the
  partition applied at DESIGN time — does a party who OWNS this
  behaviour document it? — and carries both halves, because the
  counter-examples are what stop it collapsing into "read the docs
  first".
  **(5) NEW — a negative result needs two timestamps.** A custom agent
  did not resolve at 11:37 and did resolve at ~11:50, from a definition
  file written at 11:20. A correct measurement taken too early is
  indistinguishable IN THE REPORT IT PRODUCES from a permanent
  negative. NOT the Metro-bundle footgun (`CLAUDE.md § Boot check`
  "WHICH BUNDLE THE HANDSET IS RUNNING"): same family, opposite remedy
  — a stale bundle NEVER converges and the fix is an ACTION (`expo
  start -c`), while a propagation delay converges on its own and
  re-applying the cause DESTROYS the evidence. That
  same-question-opposite-response structure is the one
  `a-stored-future-instant-is-a-promise-about-a-clock.md:57-71` says
  must be preserved rather than tidied away. *Done when:* the lesson
  requires a negative to carry when it was taken AND when the cause was
  applied, and names re-measurement rather than re-application as the
  discriminator.
  **(6) AMEND `lessons/revoke-in-migration.md` — a narrow GRANT can be
  a NO-OP.** `server/db/init/00_init_roles.sql:106-107` — the path was
  recalled as `db/init/...` and is under `server/` — runs ALTER DEFAULT
  PRIVILEGES granting arwd on every future table. Migration 0008
  observed this and remedied it with REVOKE at `:151`; `0008:76-78`
  records "The GRANT was not wrong, it was irrelevant." **The half of
  the candidate claiming a migration docstring records a restriction
  the database lacks is REFUTED** — no such migration exists. What is
  live is `0002:56`, a narrow GRANT on `doc_no_counters` omitting
  DELETE with no REVOKE anywhere in that file, on the counter whose
  gaps `be-year-comes-after-the-timezone.md:148-150` calls
  unrepairable. *Blocked on:* a measurement no read-only pass could
  take — bring Postgres up per `CLAUDE.md § Boot check`
  "Postgres must be up", then read `role_table_grants` for
  `doc_no_counters` to settle whether the omission is live or was
  widened. *Done when:* that
  measurement is recorded here with the query that produced it, and the
  lesson says a GRANT can be a no-op, that narrowing is done by REVOKE,
  and that the observable is reading the catalogue back.
  **(7) AMEND `lessons/wait-for-the-event-not-the-ticks.md` — one env
  var name, two defaults, two processes.**
  `server/app/clock_guard.py:48` defaults `CLOCK_GUARD_TICK_SECONDS` to
  60; `server/scripts/prove_clock_guard.py:119` defaults the SAME name
  to 2 and sleeps in multiples of its own value. The proof does not
  override production — it defines a second default in its own process
  — and `/health` does not report the interval
  (`clock_guard.py:89-101`), so the proof cannot ask. Full working
  already in the entry under Verification gaps beginning
  "HAS TWO DIFFERENT DEFAULTS"; not restated, and not written as a
  citation for the reason given in item (3). *Done when:* the lesson
  carries the
  cross-PROCESS case the existing file does not — its remedy presumes
  the test can observe the event, and here the event is inside another
  process — and records that this failure went RED and read as a
  product defect, the reverse of the direction that file discusses at
  `:47-49` ("Red is the lucky outcome").
  **(8) AMEND
  `lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md`
  — a prose constraint fails in BOTH directions.** A built-in agent
  described as read-only wrote a file via PowerShell, and in the same
  dispatch refused two ordinary Bash calls citing its own instructions
  before any tool call was issued: leaked once, over-fired twice, one
  run. The corpus states "prose is not a mechanism" in six places —
  `a-mutation-on-a-protected-write-path-needs-a-scratch-database.md:73-77`,
  `a-checker-must-not-share-the-code-it-checks.md:79-82`,
  `be-year-comes-after-the-timezone.md:43-46`,
  `unavailable-is-not-rejected.md:39-41`,
  `render-in-shop-time-not-device-time.md:86-88`,
  `a-stored-future-instant-is-a-promise-about-a-clock.md:214-218` — and
  **every one describes prose failing OPEN**: decays, forgotten, "a
  comment nobody reads". None describes one OVER-firing. *Done when:*
  the amendment states that a restriction expressed as prose in a
  prompt is a probability with a failure rate in BOTH directions at
  once, that the enforceable form is the tool grant itself
  (non-offering), and does NOT generalise it to comments in code, which
  fail in one direction only.
  **(9) AMEND `lessons/a-checker-must-not-share-the-code-it-checks.md`
  — ALREADY FILED, listed here only so the set is countable in one
  place.** Its argument is the entry above beginning "An amendment is
  OWED", found 2026-08-06, and is deliberately NOT restated: two copies
  drift. **It was absent from the recalled list of twelve**, which is
  the clearest single piece of evidence that the list was a memory
  rather than a reading.
  **REFUTED, and recorded so they are not raised again.** *A
  `log.error` in a module that defines `logger`* — does not exist. All
  four `log.*` calls are in `server/app/clock_guard.py`, which defines
  `log` at `:42`; both `logger.*` calls are in `server/app/bills.py`,
  which defines `logger` at `:28`; a union grep over `server/` returns
  exactly 6 lines and no third name. The only two `NameError` strings
  in the repo are instructions for a deliberate mutation
  (`prove_revocation.py:812-815`). *"A diagnostic wearing an
  assertion's clothes"* — COVERED three times over, and the candidate
  merged three catalogued mechanisms wrongly. The phrase is a HUNTING
  BRIEF in `.claude/agents/nemesis.md` and `hephaestus.md`, not a
  finding; its two instances are mechanisms 7 and 9 of
  `a-check-that-never-went-red-was-never-observed.md`; and the
  description "asserts a fact about its own INPUT" fits NEITHER — that
  file says so at `:513`, "Here the proof supplied neither."
  **THE TREE CARRIES A LATENT RED AS OF 2026-08-08, AND NOTHING RUNS
  IT.** Three lesson-source repairs landed today, in
  `a-check-that-never-went-red-was-never-observed.md` and
  `lessons/README.md`, so `lessons/all-lessons.md` no longer matches
  its sources and `build_all_lessons.py --check` would exit 1 —
  `:240-254` compares byte for byte after LF normalisation.
  Deliberately NOT regenerated: item (1) adds a lesson file and would
  invalidate a regeneration done now. **A known-stale generated
  artifact with no scheduled regeneration is a green nobody is looking
  at**, which is why it is written down here rather than remembered.
  *Done when:* `build_all_lessons.py --write` is run after item (1)
  lands, and `--check` is observed exiting 0.
  **CLEARED 2026-08-08 in `14e94d5`, AND THE INFERENCE IS NOW A
  MEASUREMENT.** `--write` exit 0, then `--check` exit 0: `CHECK OK`,
  37 lesson files, 37 TOC entries, 252273 bytes, LF-normalised. The
  paragraph above predicted exit 1 from reading `:240-254` and never ran
  it; that prediction was correct and was still a prediction.
  **THE CITATION CHECKER FOUND NINE REAL BREAKS WHERE FOUR WERE
  EXPECTED, AND THREE OF THE NINE WERE INTRODUCED BY THIS ENTRY.** Run
  2026-08-08 over all TEN root sources, not the two-file default at
  `tools/verify_citations.ps1:69`. Before repair `CITATIONS=177
  BROKEN=13`; after, `CITATIONS=176 BROKEN=10`. **BROKEN counts CONTROL
  failures as well as breaks** — `:164` and `:173` both increment it — so
  the count is read and the exit code is not: 4 of the 10 are the
  non-empty controls that BRIEFING/CLAUDE/README/RED_TEAM produce by
  legitimately carrying no citations, and 6 are real.
  **The three that were mine are FIXED rather than filed**, and all three
  were one defect: a handle wrapped across two lines, so the string
  exists on no line of the target — the rule `START_HERE.md:8-11` states
  about itself and which binds every file that cites. Two of them could
  not be fixed by unwrapping, because a citation whose TARGET is the file
  it is written in counts its own line and can never reach the
  exactly-one hit `:138` requires; those are prose now, and item (3) of
  this entry says why.
  **THE SIX THAT REMAIN ALL PREDATE THIS WORK, AND TWO WERE NEVER
  RECORDED.** Three are genuine, the target lacking the string:
  `OPEN_ITEMS.md:181` and `PROJECT_STATUS.md:134` both cite
  `ROADMAP.md § STAGE 1` with the handle `prove_reconcile.py back to
  green`, and `OPEN_ITEMS.md:1090-1091` cites `RED_TEAM.md` with the
  handle `and nothing else`. **Both are written here with the handle in
  BACKTICKS rather than quotes on purpose:** rendering a broken citation
  in citation form REPRODUCES it, and describing these two would have
  added two more breaks to the count this paragraph reports. That is
  item (1)'s mechanism 3 arriving for the third time in one day, in the
  act of writing it down.
  Three are wrapped strings: `OPEN_ITEMS.md:992-993`,
  `OPEN_ITEMS.md:1211-1212`, and in `SRS_MAP.md` the entry naming
  `tsconfig.device.json` — the last a wrapped SECTION name rather than a
  handle. **That one is named by what to look for rather than by line
  because the line form moved in three consecutive commits** as this work
  grew the file above it; a pointer that has to be repaired every time
  something is inserted is not a pointer. It is still not rendered in
  citation form, for the reason given two paragraphs up. The two never
  recorded are the first two wraps.
  **THE FOUR KNOWN BREAKS WERE SUPPLIED AS FACT AND WERE WRONG IN BOTH
  DIRECTIONS, and the owner recorded why rather than letting it pass:**
  the line numbers came from a report several hours old, from a file that
  had grown by two hundred lines in between, and were not re-measured.
  One of the four, `OPEN_ITEMS.md:708`, carries no citation at all today.
  **The count came out nine instead of four because the session
  re-measured rather than trusting the coordinates it was handed.** That
  is the shape item (4) of this entry describes — read the spec before
  designing the experiment, and know which numbers are owned by someone
  else — arriving from the OWNER's side rather than the session's, and it
  is the second time in one day a number passed along as fact did not
  survive contact with the files. The first was the twelve candidates, of
  which two were refuted. Neither is a reason to distrust the source; both
  are the reason the re-measurement is not optional.
  *Done when:* the six are repaired at their sources — the three wraps by
  putting each handle or section name on ONE line, the three genuine ones
  by finding the heading or handle that replaced what they cite — and a
  full ten-source run reports `BROKEN=4`, those four being the controls
  and nothing else.
  **AMENDED 2026-08-09 — THAT DONE-CONDITION CAN BE SATISFIED BY A RUN
  THAT READ ONE FILE, and the obvious way to type it is the one that
  does.** `powershell -File tools\verify_citations.ps1 -Source A B C`
  binds only the FIRST value and silently discards the rest: a
  non-advanced script swallows the remaining arguments into `$args`,
  where nothing looks at them. Measured 2026-08-09 with six sources named
  on one command line — `SOURCES=1  CITATIONS=42  BROKEN=0`, **EXIT 0**,
  five files named and never opened, both positive controls printing OK
  and truthfully, about the one file it read. The COMMA spelling is
  already recorded in
  `lessons/a-check-that-never-went-red-was-never-observed.md`'s sixth
  mechanism as harmless BECAUSE it is red — it degrades to one filename
  and takes the SOURCE MISSING branch — and it is that documented red
  which pushes the reader toward the silent spelling. Written up as an
  entry in `CLAUDE.md § Machine footguns` in `2a3fb93`. **Whoever closes
  this item must invoke it with the call operator —
  `& .\tools\verify_citations.ps1 -Source @('A.md','B.md',...)` — and
  READ `SOURCES=` and confirm it equals the number passed, before reading
  `BROKEN`.** A count nobody checked is a corpus nobody checked.
  **RE-MEASURED 2026-08-10 AT HEAD `0241cc8`. THE SURVEY IS CLOSED — WHAT IS
  LEFT IS REPAIR, NOT INVESTIGATION, AND NOBODY SHOULD SURVEY THESE A FOURTH
  TIME.** Run with the call operator over the six root documents that actually
  carry citations, `SOURCES=6` read and confirmed before anything else:
  `CITATIONS=227  BROKEN=6`, both controls OK on every one of the six. The
  2026-08-08 breakdown above HELD, and it was re-derived from the files
  WITHOUT being read first, so the two measurements are independent rather
  than one copied forward: **three wrapped strings, three the target
  genuinely lacks.** Named below by IDENTITY and never by line, because every
  line number in the paragraphs above has already rotted. Measured against the
  coordinates recorded on 2026-08-08: the two wrap sites in this file have both
  moved by **850** lines, the `RED_TEAM.md` one by 850, the one in this file
  citing stage 1 by 85, and the `PROJECT_STATUS.md` one by 355. Not one of the
  five still points at what it named.

  - **WRAPPED — repair by putting the string on ONE line in the CITING file.**
    In this file, the citation of the stage-3 step in `ROADMAP.md` whose
    handle breaks after `User`, and the citation of the workflow rule in
    `CLAUDE.md` whose handle breaks after `the owner`. In `SRS_MAP.md`, the
    entry naming `tsconfig.device.json`, whose wrapped SECTION name breaks
    after `Known stale`. All three targets hold the string intact; nothing is
    wrong at the far end.
  - **ABSENT FROM THE TARGET — repair by finding the heading or handle that
    replaced what they name.** In this file and in `PROJECT_STATUS.md`, both
    citing the stage-1 step in `ROADMAP.md` with the handle
    `prove_reconcile.py back to green`: the checker reports `hits=0` from both
    sites, and a search across the repository finds that string only in the
    two lines that cite it. And in this file, the citation of `RED_TEAM.md`
    with the handle `and nothing else` — **the one cause not visible from the
    checker's output at all.** The target's line reads
    `and **nothing else**:`, so the emphasis markers sit INSIDE the span the
    handle quotes and no line carries the literal string. The checker can only
    report a zero; it cannot say that the text is present and punctuated
    differently. Repair at the citing end, in one line.

  **THE DONE-CONDITION ABOVE IS WRONG FOR THIS SOURCE LIST AND MUST NOT BE
  USED AS THE TARGET.** It names a ten-source run reporting `BROKEN=4`, those
  four being non-empty controls fired by files that legitimately carry no
  citations. Over the SIX sources that do carry them no control fires at all,
  so the target is **`BROKEN=0`** and any non-zero is a real break. Which
  number is correct depends entirely on the source list, so read `SOURCES=`
  first and decide which of the two you are aiming at.

  **AND DO NOT RENDER ANY OF THE SIX IN CITATION FORM WHILE WRITING ABOUT
  THEM.** The paragraph above gives the reason and it is not a stylistic
  preference: a broken citation written in citation form is parsed, counted,
  and raises `BROKEN`, so describing the problem manufactures more of it.
  Every handle in this entry is in backticks for that reason.
  **ALSO OWED, and NOT part of the nine — three MACHINE FOOTGUNS for
  `CLAUDE.md § Machine footguns`,** kept out of `lessons/` by the rule
  as amended today (`CLAUDE.md § Workflow` "Two homes, one test"): the
  PreToolUse gates record every shell command verbatim into
  `.claude/hooks/*.log` (`pipe_gate.py:237`, `commit_gate.py:199`,
  under `settings.json`'s `"matcher": "*"`), so a repo-wide search
  writes its own search terms into the tree; ripgrep skips a gitignored
  path when the search root is a DIRECTORY and reads it when the root
  is the FILE — measured both ways, `rg -ic 'read-only' .claude/` exits
  1 while `rg -ic 'read-only' .claude/agents/` returns a hit, against
  `git check-ignore` reporting that file NOT ignored; and `git log
  --since` with a bare date inherits the current time-of-day, so
  `--since=2026-08-08` returned 0 commits where `--since='2026-08-08
  00:00'` returns 18. *Done when:* all three are entries in `CLAUDE.md
  § Machine footguns` in that section's symptom / why it lies / what to
  do instead form.
  **THE COUNT ABOVE HAS NOT GONE DOWN — 2026-08-20. All three are still
  owed and NONE of them was swept by the phase writing this line**, whose
  brief forbade it: their evidence has not been re-measured, and writing
  them out of this entry's summary is the report-is-a-clue failure
  (`CLAUDE.md § Workflow` "A REPORT IS A CLUE"). **This note is here
  because a FOURTH footgun was written to `CLAUDE.md` on that date, and it
  is NOT one of these three — the outcome most easily misread as one of
  them being paid.** That entry is the `grep -i` with `-F` abort, and it
  lives at `CLAUDE.md § Machine footguns`. **The three above stay owed and
  the count stays three.**

  **WHAT IS KEPT HERE RATHER THAN THERE: the two sessions' observations,
  because the pair is what made the mechanism findable.** On 2026-08-20 the
  advising session measured `grep -iF` as `Aborted`, `EXIT=134` — twice on
  `PROJECT_STATUS.md` and again on a two-line file outside the repository —
  while the coding session measured nine bare runs of the same pair at
  `EXIT=0`, in the same repository on the same day, having first excluded
  aliasing, PATH order, the absolute path and the binary itself
  (`md5sum /usr/bin/grep` = `65b7eb148ea01dacf451bed0d1a4608e`, agreeing on
  both sides). **An earlier draft of this entry concluded "it did not
  reproduce". That sentence was struck: it was a general claim and it was
  false**, and the reason it looked true is now the footgun's whole subject
  — the failure is deterministic within a session and opposite between
  them, so re-running it in either environment confirms that environment
  and discovers nothing.

  **THE MECHANISM WAS THEN FOUND, WHICH IS WHY THE FOOTGUN COULD BE
  WRITTEN AT ALL: it is the C/POSIX LOCALE.** Under `LC_ALL=C`, or with no
  locale exported at all, the pair aborts; under a UTF-8 locale it returns
  the correct case-insensitive answer; either flag alone is fine in both.
  The five measurements are at the footgun and are not repeated here.

  ***What remains open, and it is smaller than it was:*** which shell
  exported which locale, and why two tool sessions on one box differed in
  it. That is a question about the harness rather than about `grep`, and
  nothing here answers it. *Unblocks:* nothing in the tree — the operating
  rule and the remedy are both at the footgun.
  **AND A FIFTH, ADDED 2026-08-10, WHICH BELONGS BESIDE THE RIPGREP ONE ABOVE
  BECAUSE IT IS THE SAME FAILURE WEARING THE SEARCHER'S OWN CLOTHES: A PATTERN
  CAN RETURN "No matches found" BECAUSE THE PATTERN IS BROKEN, NOT BECAUSE THE
  TEXT IS ABSENT.** Measured 2026-08-10: a search for the fail-closed wording
  across every `*.md` returned no matches, and the text was in TWO files the
  whole time. The cause was a `\n` inside the pattern's own alternation, which
  made the alternation match nothing; a simpler pattern found all three sites
  immediately. **It lies in exactly the direction the ripgrep entry does — an
  empty result reads as "the thing is not there" when it means "the instrument
  did not look" — and it is worse in one respect: the ripgrep case at least has
  a rule (root is a directory), while this one has no tell at all.** It was
  caught only because the searcher had personally written the missing text
  minutes earlier and knew it existed; nothing in the output would have said so
  otherwise. *Done when:* it is an entry in `CLAUDE.md § Machine footguns` with
  the others, and the rule it carries is the one that generalises: **a search
  that returns zero needs a PRESENCE control — the same pattern against
  something known to match — before the zero is reported as an absence.**
  **AND A FOURTH, WHICH IS A CORRECTION RATHER THAN AN ADDITION —
  `CLAUDE.md § Machine footguns` IS WRONG ABOUT THE BLOB, IN THE ONE
  PARAGRAPH THAT ALREADY RECORDS A WRONG CORRECTION.** Measured
  2026-08-08 while committing the repairs above, because that paragraph
  says to check the blob AFTER the commit and count. `CLAUDE.md:191`
  states "the blob at `9f929ad` is CRLF, 42 of 42" and `:209-211` lists
  four agreeing points including "blob at `62cee25` CRLF 41/41".
  **Both blobs are LF.** `62cee25` stored 24531 bytes, CR=0, LF=41;
  `9f929ad` stored 25619, CR=0, LF=42; the parent of this work
  `6b8b2d4`, CR=0; and every one of the last 20 commits touching the
  file, CR=0. **The obvious confound was ruled out rather than
  assumed:** if `git show` stripped CR on output its stream would be
  shorter than the stored size, and it is not — stored equals streamed
  at both commits, 24531/24531 and 25619/25619 — so no filter runs and
  the counts are the stored blobs'. The WORKING TREE is genuinely CRLF
  and nothing here disputes that: today CR=43 LF=43, and 31482 worktree
  bytes minus 31439 blob bytes is exactly 43. So the paragraph is right
  that the two are different objects and wrong about the value one of
  them holds. Its BOM claim is CORRECT — `efbbbf` on both blobs.
  **The sharp part, and why this is a queue entry and not a quiet
  edit:** the correction appended in `9f929ad` said the blob would be
  LF, and that correction was RIGHT. The correction OF it is what
  stands in the file today, and it is the wrong one — so the paragraph
  now warns against the reasoning that produced the true answer.
  **Nothing practical changes:** `build_all_lessons.py` reads the
  WORKING TREE from disk, which is CRLF and BOM'd, so both stated
  reasons for excluding `README.md` from `all-lessons.md` still hold.
  ~~*Done when:* `:188-215` is rewritten against these measurements — BOM
  claim kept, working-tree claims kept, blob claims corrected — each
  with the instrument named, because the last two attempts at this
  paragraph disagreed about the answer and neither recorded how it was
  measured.~~
  **OWNER RULING 2026-08-08 ON HOW THIRD MUST DO IT, and it constrains
  the FORM rather than the content: the repair is NOT to write a third
  correction.** It is to state what was MEASURED — carrying the
  stored-versus-streamed check that ruled out the output filter, because
  that check is the only thing separating this answer from the two
  before it — and to say plainly WHICH correction was right and which
  superseded it wrongly. A third correction written without the
  measurement attached would be the same failure a third time, and the
  paragraph would then read wrong, right, wrong, and unfalsifiable in
  turn.
  **CLOSED 2026-08-10 by `a361e53`, with every clause answered rather than
  waved at.** *(This line read "by the commit that carries this line" and
  struck a PARAPHRASE — "the passage is rewritten against these measurements"
  — while the sentence it paraphrased sat unstruck fifteen lines above, so the
  file showed an OPEN done-condition and a struck sentence that appears
  nowhere else in that form. The done-condition is now struck WHERE IT LIVES,
  and the closing commit is NAMED: "the commit that carries this line" stops
  being true the moment anything else edits the line, which is what just
  happened.)* The passage is rewritten: BOM claim kept
  (`efbbbf` on both objects), working-tree claims kept and now LABELLED as
  working-tree, blob claims corrected to CR=0. The instruments are named in
  the entry itself — `git cat-file blob` captured as bytes, `git cat-file -s`
  agreeing with that capture at 51504, `git ls-files --eol` reporting
  `i/lf w/crlf`, and a counter controlled against a stream built to carry a
  BOM, CRLF pairs, a lone CR, a lone LF, a blank line and no trailing newline
  before any figure was read off it. The OWNER RULING is met in form as well
  as in content: it is a measurement rather than a third correction, it
  carries the stored-versus-streamed check that rules out an output filter,
  and it says plainly that the blob half was false and that the appended
  correction it overturned was right. **One thing was NOT established and is
  written into the entry as unestablished:** which command produced the
  original wrong figure. No record of it survives, and guessing is how that
  paragraph went wrong the first time.

  **AND ONE MORE FOOTGUN OWED, MEASURED 2026-08-23 AND FOUND BY ITS OWN CONTROL
  FAILING: `grep` ON THIS BOX CANNOT SEE A `CR` BYTE, AND REPORTS ZERO.** It
  opens files in TEXT mode, so CRLF is stripped before the pattern is applied and
  a CR count comes back **0, exit 1** — a false CLEAN, silently, with no error.
  **It matters because the paragraph directly above is the repository's most
  careful statement about which object carries CR, and it tells a reader to
  count** — so the instrument the reader reaches for is the one that cannot.
  Measured, with the needle built from its codepoint (`CR=$(printf '\015')`,
  confirmed `0d`) rather than typed:

  - A file verified CRLF by its bytes, `61 6c 70 68 61 0d 0a 62 65 74 61 0d 0a`:
    `grep -c "$CR"` → **0, exit 1**. `grep -Uc "$CR"` → **2, exit 0**.
  - The repository's own CRLF working-tree file, `lessons/README.md`, whose byte
    count read from Python is **CR=65**: `grep -c "$CR"` → **0, exit 1**;
    `grep -Uc "$CR"` → **65, exit 0**, agreeing exactly with the authority.
  - **THE OTHER HALF, because a flag that always answers yes passes the first
    test just as well:** an LF-only file under `grep -Uc "$CR"` → **0, exit 1**.
    The evidence is the PAIR.

  **HOW IT WAS FOUND is the part worth keeping.** A CR check over three edited
  files returned three zeros and was about to be reported as evidence; the
  control in the same invocation — the one file this repository already knows
  carries CRLF — returned zero too, which is the reading that cannot be true.
  **Without that control the three zeros were indistinguishable from a working
  instrument**, and they happened to be correct, which is the worst case.
  *Done when:* it is an entry in `CLAUDE.md § Machine footguns` in that section's
  symptom / why it lies / what to do instead form, beside the `core.autocrlf`
  entry it directly serves. **Not written there by the phase that measured it**,
  whose declared file set did not include that file. *Unblocks:* nothing in the
  tree — the operating rule is `grep -U`, or count the bytes in Python, and say
  which.

- **Four open questions carried by `ROADMAP.md` rather than this list**,
  because each one moves a step rather than adding an item: does the
  pilot shop need a printed slip on day one (if yes, printing and the
  desktop scaffold move onto the critical path and the whole order
  changes); where master-data screens live; who creates a shop's first
  admin; and whether the second-hand goods act's answer needs to arrive
  before real data accumulates under the current schema.
  **THE THIRD OF THOSE FOUR IS NOW PART-ANSWERED — 2026-08-10, and the count
  above is left as written.** A shop's FIRST admin comes from an installer
  running `server/scripts/provision_shop.py` at a shell, and who may create
  the SECOND is settled: an admin may create another admin
  (`ARCHITECTURE.md § 10. The three settled decisions` D7). What is still
  open under that heading is the different question of who mints a SHOP
  CODE when a shop is onboarded, which no decision touches.

- **`build_paste_set.py --check` ANSWERS A DIFFERENT QUESTION FROM THE ONE
  ITS READER IS ASKING — found 2026-08-17 by a coding session running the
  checker.** `mode_check` (`tools/build_paste_set.py:440`) prints at
  `:453-454` a line of the form `built from head : <sha>  (DIRTY tree)`.
  **The TIME in that line is honest** — it is labelled `built from head`,
  and the flag is the manifest's, so it describes the moment the set was
  built. **The SCOPE is the defect.** The flag is `working_tree_dirty`,
  whose own docstring at `:257` says in as many words: `Repo-WIDE dirty
  state. Context only -- it does NOT say the set is dirty.` The
  set-scoped answer, `dirty_set_files`, is computed in the same pass and
  written into the manifest at `:361` — and `mode_check` never reads it.
  So the reader learns that SOMETHING in this repository was uncommitted
  and cannot learn whether any of it was IN THE SET, which is the only
  form of the fact that decides whether the paste can be trusted.
  **The tool already knows better everywhere else**, which is what makes
  this an oversight and not a design: `--write`'s summary branches on the
  two properly at `:398-404`, and `MANIFEST.txt` does the same at
  `:586-594`, under a comment at `:584-585` recording that conflating them
  "once put a false claim in front of a reader who cannot check it". The
  distinction was learned, written down, and then not applied in the third
  place — `a-warning-in-one-file-does-not-protect-the-next.md`, in the same
  file this time.
  **It fails toward false alarm rather than false calm.** The tree is
  dirty far more often than the set is, so a reader is trained to see
  `DIRTY tree` and shrug — which is the condition under which the one
  occasion it mattered gets shrugged at too.
  *Not done:* nothing is changed. The tool was not touched in the pass
  that found this, and it is reported rather than repaired.
  *Unblocks:* one print in `mode_check` for the `dirty_set_files` already
  sitting in the manifest, in `--write`'s vocabulary, so the two commands
  answer the same question the same way. **Do not let that print inherit
  the wrong time:** the manifest's copy is as-of BUILD, so a set built
  clean and edited afterwards carries an empty list. Either re-ask git in
  `mode_check` — which is the fact a reader of `--check` actually wants —
  or label the figure as of the build, but not silently one while reading
  as the other.

- **MOST NEGATIVE CLAIMS IN THIS FILE HAVE NEVER BEEN CHECKED AGAINST SOURCE, and
  the sweep that measured that is KNOWN TO BE INCOMPLETE — 2026-08-12.** The
  figures and the operating rule are at the head of this file and are not
  repeated here. What belongs here is the WORK and the MECHANISM.
  **HOW THE INSTRUMENT FAILED, which is the part that must not be lost.** The
  sweep was a regex list over this file: existence phrasings in entry bodies,
  plus any negative word in an entry HEADLINE. Of the three entries already known
  to be stale, **two matched only through unrelated lines inside them** — the
  sign-out entry matched on "there is no refresh token" and the bill-author entry
  on "never designed" and "no column added there". **Their headlines did not
  match at all**, because the noun list contained `endpoint|route|screen|column|
  proof|test|client|mechanism|index|migration|scheduler|policy|middleware` and
  did not contain `sign-out` or `author` — the two subjects those entries are
  about. They were caught by luck, not by the instrument.
  **A SWEEP THAT MISSES KNOWN CASES WILL SILENTLY MISS UNKNOWN ONES**, and it
  fails in the direction that reads as completion: it returns a number, the
  number looks like a total, and whoever runs it closes the item. That is this
  repository's oldest failure shape and the reason this entry exists rather than
  a line saying "verify the rest".
  *Not done:* the remaining entries have not been checked, and the instrument has
  not been widened. *Unblocks:* widening it in three ways before it is trusted —
  the noun list must be open-ended rather than enumerated (any `no <word>` in a
  headline, triaged by hand); the phrasing list must cover the negatives the
  enumeration missed (`lacks`, `without`, `has yet to`, `is owed`, `stopgap`);
  and every entry it returns needs the same treatment the four corrected on
  2026-08-12 got — grep the artefact, and where it exists, `git log -S` the
  source text for the commit. **The count of corrected entries is four, not five:**
  the Android-coverage entry was found stale by the same sweep and already
  carried its correction from 2026-08-12, which is itself evidence that this file
  is maintained faster than any one sweep can describe it. **Its name is written
  hyphenated on purpose** — the unhyphenated form is a live citation HANDLE
  elsewhere in the tree, and reproducing it verbatim here makes it match twice
  and breaks every citation pointing at it. That happened in the first draft of
  this very entry.

- **A MACHINE FOOTGUN IS OWED TO `CLAUDE.md § Machine footguns`: CODEPAGE 874 AS A
  WRITER DOES NOT ALWAYS TRANSCODE SILENTLY — SOMETIMES IT KILLS THE PROCESS.
  Measured 2026-08-24. Queued rather than written, because `CLAUDE.md` was not in
  the bounds of the phase that found it, and it is queued WITH ITS MEASUREMENT so a
  later phase can write it without re-measuring.**
  **THE TWO-HOMES CALL IS SETTLED AND IS NOT A LESSON.** It is a property of THIS
  BOX — the ANSI codepage is 874 — so it goes to Machine footguns and gets no
  lesson file, per `CLAUDE.md § Workflow` "Two homes, one test".
  **IT IS THE OPPOSITE HALF OF THE ENTRY ALREADY THERE, WHICH IS WHY IT IS NOT A
  DUPLICATE.** That entry's whole argument is that **CP874 represents every
  character in a Thai name, so NOTHING IS LOST** — no error, no `?????`, no
  mojibake, and it breaks only when something downstream decodes the stream as
  UTF-8. This is a character CP874 **cannot represent at all**, and the failure is
  immediate, loud and fatal.
  **THE OBSERVATION, VERBATIM.** `prove_backup_restore.py` exited 1 with
  `UnicodeEncodeError: 'charmap' codec can't encode character '�' in position
  209: character maps to <undefined>`, raised inside
  `Lib/encodings/cp874.py:19`, from `run_script`'s own `print(f"    | {line}")` at
  `prove_backup_restore.py:269` — that is, while relaying a CHILD script's output.
  Everything up to that line had already printed, including a full `[OK]` table, so
  the traceback sits under what looks like a healthy run.
  **THE MECHANISM, AND BOTH HALVES ARE NEEDED.** (1) `sys.stdout.encoding` is
  `cp874` whenever stdout is a redirected non-tty, which is every run captured to a
  file. (2) The character is U+2014 EM DASH, which has no CP874 mapping, and it is
  in `restore_db.py`'s own `cannot_see()` text — the second bullet, whose position
  209 is exactly where the dash falls. **Neither file was edited by the phase that
  hit this**; the text has been there since the restore script was written, and it
  had simply never been relayed through a redirected pipe before.
  **THE REPRODUCTION, one line:**
  `uv run python scripts/prove_backup_restore.py > out.txt 2>&1` from `server/`
  — exit 1 with the traceback above. **THE CONTROL:**
  `PYTHONIOENCODING=utf-8 uv run python scripts/prove_backup_restore.py > out.txt 2>&1`
  — **exit 0**, all cells green, same code, same database. That pair is what
  establishes the fault is in the INSTRUMENT and not in the backup.
  **WHY IT IS WORTH AN ENTRY RATHER THAN A SHRUG.** It fails in the direction that
  reads as a defect in the thing under test: a backup/restore proof that dies
  mid-report looks like a broken restore, and the traceback names an encoding
  nobody was thinking about while they were reading row counts. It also generalises
  past this one script — ANY script here that relays a child's output through
  `print` is exposed the moment that child's text carries a character outside
  CP874, and several do.
  *Not done:* the footgun is unwritten and no script sets its own encoding.
  *Unblocks:* the entry itself, plus a decision on the remedy — `PYTHONIOENCODING`
  in the runbook is the cheap half, and the real one is that a relaying script
  should reconfigure its own stdout rather than depend on whoever invoked it.

- **A SEVENTH BROKEN CITATION EXISTS, IT ARRIVED AFTER THE SURVEY ABOVE WAS
  DECLARED CLOSED, AND IT IS A DIFFERENT ITEM RATHER THAN A RESTATEMENT OF THE
  SIX — re-measured 2026-08-25.** The entry above is pinned at `0241cc8` and
  reports six over the six root documents that carry citations. **It was correct
  there and it is not correct about today**, which is the distinction that makes
  this a new line rather than a duplicate: the sentence saying the survey is
  closed and nobody should survey these a fourth time is a claim about a sha, and
  a claim about a sha does not rot — what rots is reading it as a claim about now.
  **RE-MEASURED OVER THE SAME SIX-DOCUMENT CORPUS, with the call operator and
  `SOURCES=` read and confirmed as 6 before anything else: `CITATIONS=498
  BROKEN=7`**, against that entry's `CITATIONS=227 BROKEN=6`. The corpus has more
  than doubled; the breaks went up by one.
  **THE SETS WERE COMPARED BY IDENTITY AND NOT BY THE COUNT AGREEING**, because
  two unrelated sixes would look identical from a total. All six the entry
  itemises are still present and unrepaired — both stage-1 ones, the stage-3 wrap
  breaking after `User`, the workflow wrap breaking after `the owner`, the
  `RED_TEAM.md` one whose target is punctuated differently, and the wrapped
  SECTION name in `SRS_MAP.md`. **THE SEVENTH IS IN `PROJECT_STATUS.md`: the
  citation that names THIS file's code-debt section, whose section name breaks
  after the word `Code` so it spans two lines and resolves to nothing.** Same
  mechanism as three of the six; a different instance.
  **IT IS DATED, NOT GUESSED.** `git log -S` on the citing text against
  `PROJECT_STATUS.md` returns `1d8a92c`, 2026-08-24 — **fourteen days after the
  survey was closed.** So the entry above did not miss it; it did not exist yet.
  **WHY NOTHING SAW IT ARRIVE, AND THIS IS THE PART WORTH ACTING ON.** The
  checker's DEFAULT source list is two files. The three largest documents that
  carry citations are not in it, and **381 of the 498 citations live in those
  three** — so a break introduced in any of them is invisible to every run nobody
  hand-typed a source list for, which is every run. That is why the count could
  move by one over fourteen days with no instrument moving at all.
  **NOT REPAIRED HERE, DELIBERATELY.** Repairing one of seven piecemeal, inside a
  commit about something else, is the half-sweep that entry's own done-condition
  is written against; and the count is the thing whoever closes it will read.
  **AND NO CITATION IS RENDERED IN CITATION FORM ANYWHERE IN THIS ENTRY**, for the
  reason the entry above gives — describing a broken citation in citation form
  parses it, counts it, and raises `BROKEN`. This line was written to add ZERO
  parsed citations, so re-running the checker after it lands is a check on the
  edit as well as on the tree: the total must not move.
  *Not done:* seven breaks, none repaired. *Unblocks:* two decisions that are one
  piece of work — repair the seven at their sources together, and settle whether
  the checker's default source list should be the six rather than the two, since a
  done-condition nobody can reach by running the default command is a
  done-condition that will be read off the wrong number.


## What a product sold to strangers needs and this one has not built

**Raised by the owner on 2026-08-19 and DEFERRED BY THE OWNER ON THE SAME DAY.**
The deferral is a decision of that date about ORDER and about nothing else. It is
**not an assessment of importance**, and no item below has been weighed against
any other or against anything already on this list. They go to the BACK of the
queue. This file says in its own opening that it is a list with no priorities and
no dates; the ranking that does exist lives in `ROADMAP.md`, and none of these
entered it. **Nothing here was scheduled, ranked or minted, no P-number was
issued, and no settled decision was written or superseded.**

**WHY ONE SECTION RATHER THAN ITEMS SCATTERED THROUGH THE ONES ABOVE — THE SET IS
PART OF THE FINDING.** What follows is the shape of what a multi-tenant money
product sold to strangers needs and this one has not built, produced in a single
pass on a single day. Split across the existing sections that shape stops being
visible, and each item then reads as a small omission rather than as one of
twenty-two taken together.

**EVERY ITEM CARRIES ONE OF TWO MARKERS, AND NO ITEM MAY GO IN WITHOUT ONE.**
**MEASURED** — a command was run in the pass that wrote this section and what it
returned is quoted at the item. **UNVERIFIED** — reasoning from the advising
session that this pass did not confirm, carrying the words it would take to
confirm or refute it. The marker describes what was DONE, not how confident
anybody is: where only part of an item was measured, the item says in its own
words which part.

**THE COUNTS LIVE HERE AND NOWHERE ELSE, AND THAT IS DELIBERATE — twenty-two
items, fifteen MEASURED, seven UNVERIFIED.** A count in prose rots when the work
adds to the set; the repair used here is the third of the three this file already
records under `OPEN_ITEMS.md § Decisions open — the owner's, not the code's` —
confine the number to one site and say in the same sentence that it is the only
one. **Anyone adding an item edits this line.** The set is otherwise closed: it is
what one day produced, not a category anything is expected to grow into.

**ALREADY RECORDED ELSEWHERE — POINTERS, NOT ENTRIES, AND DELIBERATELY NOT
RESTATED.** Fourteen of the things raised on 2026-08-19 already have a home. They
are listed so a later reader does not re-raise them, and they are not re-argued: a
second home for one argument is the drift `CLAUDE.md § Scope and status` forbids.
Where a recorded entry leaves a genuinely new half open, that half is an ITEM
below and says so.

- **Attempt limiting, anywhere in the API** — recorded 2026-08-10 as a
  whole-system gap under `OPEN_ITEMS.md § Decisions open — the owner's, not the code's`,
  filed as one item on purpose so that fixing one endpoint cannot look like
  fixing the system.
- **Free guessing at the password route** — the same entry, widened by `cb11f6a`
  on 2026-08-10. It is not a second finding and does not need a second line.
- **HTTPS** — a requirement of `ROADMAP.md § P1.2 — A server a shop can reach`,
  not a later hardening pass, and named in that step's DONE WHEN.
- **The daily report's sequential scan** — `PROJECT_STATUS.md § Known scaling limits`.
- **A backup with no schedule, no off-site destination and no retention rule** —
  two entries under `OPEN_ITEMS.md § Blocking one real paying shop`, one for the
  schedule and the destination, one for the tooling's inability to reach a
  database that is not local.
- **Dumps unencrypted** — `archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md § Earlier phases` puts encryption at
  rest on the deliberately-not-built list beside scheduling, off-site upload and
  retention. What that line does not say is WHAT the plaintext holds; that is an
  item below.
- **iOS has never run the migration** — `OPEN_ITEMS.md § Verification gaps — built, not proven`.
- **Nothing pins a certificate, and the address is baked into the build** —
  `ARCHITECTURE.md § 14.7 What the client requires, and what it costs to change`
  records both in one paragraph, including the redistribution cost that makes
  pinning repeat the same trap. **The advising session did not know this one was
  already recorded.**
- **No audit log of any kind** — `SRS_MAP.md § 3. The schema gap`, which states
  that nothing records who changed a price, who retired a product or who signed
  in. `ARCHITECTURE.md § 10. The three settled decisions` covers only the PROVIDER
  side of it.
- **No key rotation path for the JWT secret** — `SRS_MAP.md § 6. Security posture, per area`,
  under Absent.
- **The one-hour token and the absence of a refresh token** — the same subsection,
  together with the two other decisions that rest on the number. The OFFLINE
  consequence is not there, and is the first item below.
- **How a licence is enforced** — `SRS_MAP.md § 7a. How a licence is enforced — nothing exists`,
  with the per-term counts behind it.
- **Printing exists nowhere and is assigned to the desktop** —
  `SRS_MAP.md § 7c. Printing — nothing exists, and it may not be a late item`.
  That a pilot needs a PC only because of the print decision is already stated at
  `ROADMAP.md § P1.13 — The desktop scaffold`; what nobody has costed is a PC per
  shop as a condition of sale.
- **Weight typed by hand, and Excel export** — both on the out-of-MVP list at
  `PROJECT_STATUS.md § What is NOT built`, and the typed weight is architecture:
  `CLAUDE.md § Architecture` states it as a property of `mobile/`.

**SECURITY**

- **[MEASURED] A YARD WITH NO SIGNAL AT THE HOUR MARK CANNOT SIGN IN AGAIN, AND
  THE QUEUE STOPS MID-SHIFT.** The three facts behind this are each recorded and
  their CONJUNCTION is not. Measured in this pass:
  `grep -rn "JWT_TTL_SECONDS" server/` returns `server/app/config.py:85` reading
  the environment with the default `"3600"`, plus `server/.env:9` and
  `server/.env.example:21` both setting 3600.
  `grep -rniE "refresh_token|refresh token|/refresh" server/app/` returns ONE
  line, `server/app/users.py:19`, and it is a comment saying there is none — no
  route, no handler. The route inventory taken the same way
  (`grep -rhoP '@(app|router)\.(get|post|put|patch|delete)\("([^"]+)"' server/app/*.py`,
  32 distinct paths) contains `/auth/login` and nothing that renews anything, so
  **re-authenticating is an HTTP round trip to the server or it does not happen.**
  The consequence is the part nothing records: a shift longer than an hour in a
  place with no signal ends holding a token the server will refuse, and the device
  cannot get another until signal returns — the send queue meets 401 and stops,
  with cash still crossing the table. The lesson at
  lessons/401-is-about-the-caller-not-the-bill.md records the no-refresh decision
  as deliberate and argues it for the ONLINE case, where signing in again is
  available; this is the offline case that argument does not reach. The revocation
  entry earlier in this file treats the absence of a refresh token only as a BOUND
  on how long a stolen token lives, which is the same fact pointed the other way.
  *Not done:* nothing. *Unblocks:* the owner deciding whether a yard is expected to
  work a full shift out of signal, which is a question about the product rather
  than about the token.
- **[MEASURED] THERE IS NO API VERSION, SO ONE CONTRACT CHANGE BREAKS EVERY
  HANDSET THAT HAS NOT BEEN UPDATED.** Measured:
  `grep -rniE "api/v1|/v1/|API_VERSION" server/app/ --include='*.py'` exits **1**,
  zero hits. **The negative carries a control in the same run** — the identical
  command with `|/auth/login` added to the pattern returns 8 lines and exits 0, so
  the instrument was looking where it was pointed. The 32 route paths inventoried
  above carry no version segment of any kind, and `server/app/main.py:84`
  constructs `FastAPI(title="Recycle Online API (Phase 2c-2)", lifespan=lifespan)`
  with no `version` argument. Against that,
  `ARCHITECTURE.md § 14.7 What the client requires, and what it costs to change`
  records that the address is fixed at build time — so there is no way to force an
  update, and no way for the server to tell an old client that it is obsolete. A
  shop with six phones is six independent builds. *Not done:* nothing. *Unblocks:*
  nothing built — it decides what a contract change costs on the day one is needed.
- **[MEASURED] WHAT `mobile/app.json`'s `extra` CARRIES TODAY, AND WHAT DECIDES
  WHAT IT CARRIES NEXT.** A release build is readable by anyone holding the app,
  and `extra` is compiled into it. Measured by reading the file in this pass: it
  holds `apiBaseUrl` and two `_comment` strings and nothing else, and
  `mobile/app/config.ts` carries a written prohibition in its own text against
  putting credentials back there, with the history of the one that sat in a
  tracked file for months. **So the present contents are fine and the item is
  about the future**: nothing reads that file at any boundary, no check names it,
  and the prohibition is a comment. *The half this pass did not measure* is
  whether anything ought to — a process question no command settles. *Not done:*
  nothing.
- **[UNVERIFIED] A DUMP HOLDS THE SELLERS' IDENTITY DOCUMENTS AND THE CLUSTER'S
  PASSWORD HASHES, IN PLAINTEXT.** That the dump is unencrypted is recorded (see
  the pointer above). What is not recorded is what it contains: `id_number` and
  `address` are ordinary nullable columns on `sellers`, and the roles half of the
  backup comes from `pg_dumpall`, which writes role definitions. A file that can
  be copied off a laptop is therefore a file of national ID numbers with the
  cluster's credentials beside them. *To confirm or refute:* read
  `server/scripts/backup_db.py` for what the globals dump contains and whether
  role passwords appear in it; grep `id_number` and `address` over
  `server/migrations/versions/`; and open one produced dump in bytes rather than
  reasoning about it. *Not done:* nothing.
- **[UNVERIFIED] A PRICE CHANGE HAS NO AUTHOR WHILE A BILL NOW HAS TWO.** The
  absence of an audit log is recorded (pointer above). The ASYMMETRY is not:
  `purchase_bills` carries `created_by` and the void columns carry `voided_by`, so
  the money rows name a person, while the master data that DECIDES what the money
  rows say names nobody. A shop investigating a bad payout can see who wrote the
  bill and not who moved the price it was written against. *To confirm or refute:*
  `git grep -n "created_by\|voided_by" -- server/migrations/versions/` against the
  column lists of `product_prices` and `products`. *Not done:* nothing.
- **[UNVERIFIED] CHANGING THE JWT SECRET ENDS EVERY SESSION IN EVERY SHOP AT
  ONCE.** The absence of a rotation path is recorded (pointer above); the blast
  radius is not. One symmetric key signs every token for every tenant, so the
  remedy for a leaked secret and the remedy for nothing are the same action, and
  it signs out every yard on every phone at whatever moment it is taken. *To
  confirm or refute:* read the claim list in `server/app/security.py` for a key
  id, and grep `JWT_SECRET` over `server/app/` for any second key. *Not done:*
  nothing.

**AVAILABILITY**

- **[MEASURED] ONE CONNECTION POOL SERVES EVERY TENANT AND NOTHING BOUNDS ANY
  SHOP'S SHARE OF IT.** Measured: `server/app/db.py:43` is
  `engine = create_async_engine(APP_DATABASE_URL, pool_pre_ping=True)` and `:50`
  builds the directory engine the same way; a grep for `pool_size` and
  `max_overflow` over that file returns nothing, so the library's defaults stand
  and there is one pool for the whole product. One shop's traffic and one shop's
  slow query draw from the same place as everybody else's.
  `ARCHITECTURE.md § 14.6 What is NOT required — stated on purpose` already
  records that no connection-count figure is fixed anywhere, which is the adjacent
  fact and not this one. *Not done:* nothing.
- **[MEASURED] NOTHING LIMITS THE SIZE OF A REQUEST BODY, AND THERE IS EXACTLY
  ONE MIDDLEWARE IN THE WHOLE API.** Measured:
  `grep -rn "middleware" server/app/ --include='*.py'` returns **one line**,
  `server/app/main.py:160`, which is the clock guard. A grep for `max_length`,
  `content-length`, `max_size` and `limit` over `server/app/main.py` returns
  nothing, and no route sets one. So there is no layer at which a body limit could
  be sitting unnoticed. **This one measurement bounds two other items** — the
  attempt-limiting entry recorded elsewhere in this file, and the request-id item
  below — because all three would live in the layer that holds one thing.
  *Not done:* nothing.
- **[UNVERIFIED] PHOTOGRAPHS WILL BE THE LARGEST DENIAL SURFACE IN THE SYSTEM,
  AND THE ANGLE ALREADY RECORDED IS A DIFFERENT ONE.**
  `OPEN_ITEMS.md § Decisions open — the owner's, not the code's` carries the photo
  question as a BACKUP problem and as a queue-shape problem, and closes both
  halves on S14 and S15. Neither half is about a client that retries: hard rule 8
  writes the photo locally first, and a device queue with no give-up sends a
  multi-megabyte payload again and again at a server with no body limit. The two
  facts are recorded in different files and their product is recorded nowhere.
  *To confirm or refute:* once a photo path exists, read the retry policy the
  outbox gives that kind against the body limit the server sets, and measure one
  photograph at the chosen resolution — the arithmetic in the recorded entry is
  labelled unmeasured there and must not be carried forward as a figure.
  *Not done:* nothing; no photo path is written.
- **[MEASURED] NOTHING NAMES FAILOVER, A REPLICA, A STANDBY OR HIGH
  AVAILABILITY.** Measured with `grep -rciE` over `OPEN_ITEMS.md`,
  `PROJECT_STATUS.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `SRS_MAP.md` and
  `BRIEFING.md`: `failover` 0, `standby` 0, `high availability` 0, `replica` 2 —
  and both of those two are `rolreplication` and `session_replication_role` in
  role listings, neither about redundancy. **Control in the same run:**
  `tenant_id` returns hits in all six files, so the instrument read all six. The
  hosting model IS settled — S13 at `ROADMAP.md § What the owner has settled` puts
  production on the owner's own machine with a domain and a tunnel — and nothing
  anywhere says what happens when that machine is off. *The related step that DOES
  exist:* `ROADMAP.md § P2.3 — An off-site restore of real shop data` exists
  precisely so that the first restore of real data is not the one performed in an
  emergency, so the rehearsal half is scheduled and the redundancy half is not.
  *Not done:* nothing.

**OPERATIONS**

- **[MEASURED] NOTHING MONITORS AND NOTHING ALERTS, SO THE SHOPS LEARN OF AN
  OUTAGE BEFORE THE VENDOR DOES.** Measured the same way as the item above:
  `monitoring|alerting|on-call|pager` returns exactly one hit across the six
  documents, and it is the word "pager" at `OPEN_ITEMS.md:1719` meaning a thing
  you read a proof through. The same six-file control applies. **S4's provider
  screen is the seed of this and is not the thing** —
  `ROADMAP.md § What the owner has settled` settles a screen showing when each
  shop last sent a bill, and a screen is something a person has to open; an alert
  is something that finds the person. *Not done:* nothing. *Unblocks:* the owner
  deciding whether the vendor is expected to notice an outage at all.
- **[MEASURED] TWO MODULES LOG, AND NOTHING CARRIES A REQUEST ID.** Measured:
  `grep -rniE "^import logging|logging\.|logger" server/app/ --include='*.py'`
  returns six lines in two files — `server/app/bills.py` at `:11`, `:28`, `:110`
  and `:515`, and `server/app/clock_guard.py` at `:34` and `:42`. There is no
  logging configuration and no formatter, and
  `structured log|json log|request id|correlation id` returns zero across the six
  documents under the control above. So a shop reporting that a bill did not go
  through cannot have that joined to anything the server wrote, and the one path
  that logs at all is the bill path. *Not done:* nothing.
- **[MEASURED] THERE IS NO DEPLOYMENT PATH, NO CI CONFIGURATION AND NO
  ROLLBACK.** Measured: `ls .github` and `ls .gitlab-ci.yml` both report no such
  file or directory, and `rollback|blue-green|rolling deploy` returns zero across
  the six documents under the control above. `PROJECT_STATUS.md § Current phase`
  already records that there is no CI and no hook that runs a proof, which is the
  same absence seen from the proofs' side; **what is added here is that no CI
  configuration exists in the tree at all, and that nothing anywhere describes how
  a change reaches a shop or how it is taken back out.** *Not done:* nothing.
- **[MEASURED] A SHOP THAT LEAVES CANNOT TAKE ITS DATA WITH IT.** Measured:
  `data export|export their data|shop that leaves|offboard` returns zero across
  the six documents under the control above. The nearest recorded thing is Excel
  export on the out-of-MVP list, which is a REPORTING feature and not this — this
  is every bill, seller and price for one `tenant_id`, in a form somebody else can
  read, produced without a developer. *Not done:* nothing. *Unblocks:* what the
  contract can promise a shop about its own records.
- **[UNVERIFIED] THERE IS NO SUPPORT PATH FOR A STUCK BILL.** A bill that will not
  send is visible on the handset by design — hard rule 8 requires the failure to
  be visible — and there is no route by which anybody outside the yard can see it,
  ask about it, or clear it. The nearest thing that exists is a developer with a
  database. *To confirm or refute:* read the outbox's terminal states against the
  question "what does the operator do next", and check whether any recorded step
  gives the provider a read of one shop's queue.
  `ARCHITECTURE.md § 14. What this system requires of a host` notes that a support
  path speaking only to the host is a different thing from one inside the product.
  *Not done:* nothing.
- **[MEASURED] WHAT A LAPSED LICENCE DOES IS ALREADY DECIDED, AND THE FILE THAT
  CALLS IT UNRESOLVED HAS NOT BEEN TOLD — SO THIS ITEM AS RAISED WAS WRONG.** It
  was raised as "no licence enforcement behaviour decided". **It is decided.**
  `ROADMAP.md § What the owner has settled` D3 — that file's own D-space, and not
  `ARCHITECTURE.md`'s, which numbers a different D3 — settles that a lapsed
  licence does NOT stop a shop trading: it warns on screen and withholds what is
  not the act of buying and selling, on the argument that the shop is not the
  party who failed to pay. Against that,
  `SRS_MAP.md § 7a. How a licence is enforced — nothing exists` still names what a
  lapsed licence does to a shop that has already bought a load today as the one
  question nothing answers. **Both sentences are in the tree and one of them is
  stale.** What IS still absent is any implementation: measured in this pass,
  `grep -rniE "licen[cs]e" server/app server/migrations` exits **1** — no licence,
  subscription, lapse or expiry concept reaches the code. *Not done:* nothing.
  *Unblocks:* a correction pass over that survey file, which is outside this
  section's scope.

**FLOW**

- **[MEASURED] THERE IS A SEARCH, AND IT IS THE SELLER PICKER'S — THE CLAIM THAT
  THERE IS NONE IS FALSE.** Raised as "no search anywhere, with seller lists that
  grow". Measured by reading the file: `mobile/app/SellerPicker.tsx:5` describes
  itself as "a SEARCH screen with a list under it, not a list to scroll", `:126`
  renders the box, whose placeholder at `:129` is `ค้นหา: ชื่อ / รหัส / ทะเบียนรถ`, and
  `:89` calls `searchSellers`, defined at `mobile/src/cart/sellers.ts:148`. It
  matches code, name and the plates THIS DEVICE has recorded, which that file's
  own header explains. **What is true after the correction, and it is narrower:**
  the search is a linear scan in memory over the cached list, so its cost grows
  with the list rather than with the query; no server route takes a search
  parameter, none of the 32 paths inventoried above; and nothing else — bills,
  products — has one at all. *Not done:* nothing.
- **[MEASURED] ONE TYPO RE-KEYS A WHOLE BILL, BECAUSE NOTHING REISSUES FROM AN
  EXISTING ONE.** Hard rule 5 makes void-and-reissue the only correction, and the
  reissue half is hand typing. Measured:
  `grep -rniE "reissue|re-issue|duplicate the bill|copy a bill" mobile/app mobile/src server/app`
  exits **1**. **Control in the same run** — the identical command with `|void`
  added to the pattern returns 80 files and exits 0, so the instrument was reading
  the same trees. *Not done:* nothing. *Unblocks:* how long a correction takes at
  a weighbridge with a queue behind it.
- **[MEASURED] ONE PRICE LIST PER SHOP IS A SCHEMA CONSTRAINT, NOT AN OMISSION.**
  Measured: `server/migrations/versions/0001_initial_schema.py:171` declares
  `CONSTRAINT uq_prices_tenant_product_grade UNIQUE (tenant_id, product_id, grade)`,
  so a shop holds exactly one price per product per grade and there is nowhere to
  put a second list. No table carries a branch or location column. **A shop with
  two yards is therefore two tenants, or it is one price** — and neither answer
  has been written down. *Not done:* nothing. *Unblocks:* what a shop with
  branches is sold.
- **[UNVERIFIED] THE TYPED WEIGHT IS WHERE ERROR AND FRAUD ENTER, AND THE ONLY
  THING ANSWERING IT IS A PHOTOGRAPH.** That the weight is typed is architecture
  and is recorded (pointer above); the exposure is not. Nothing cross-checks the
  number, and the shop's only corroboration is S12's photograph of the display,
  which carries more of this system's integrity than its one line suggests. *To
  confirm or refute:* read whether any recorded step gives that photograph an
  obligation — must exist, must be taken at weighing — or leaves it optional, and
  whether anything compares gross minus tare against net at the edge. *Not done:*
  nothing.

**DEVICES**

- **[MEASURED] NOTHING NAMES A TABLET OR A LARGER SCREEN.** Measured:
  `tablet|iPad|larger screen` returns zero across the six documents under the
  control above. The app is phone-shaped by construction, and a weighbridge desk
  is a plausible place for something bigger. *(`mobile/app.json` sets
  `ios.supportsTablet` true, which is an Expo build flag and not a layout — it
  says the binary may install, not that a screen was designed.)* *Not done:*
  nothing.
- **[UNVERIFIED] THE DESKTOP WILL BE A SECOND CODEBASE SHARING ONE PACKAGE, SO
  EVERY SCREEN IS BUILT TWICE.** `packages/shop-time` is the shared piece and was
  created for exactly this reason; everything else — the refusal vocabulary, the
  bill card, the money formatting, the offline states — is written once for Expo
  and would be written again for Electron. Searched
  `built twice|written twice|two implementations` over the six documents: the hits
  are about the be-year offset and not about the client surface, so the cost is
  not recorded. *To confirm or refute:* once `desktop/` has code, count the
  modules imported from `packages/` against the modules written under
  `desktop/src/`. *Not done:* nothing; `desktop/` holds one tracked file.
  