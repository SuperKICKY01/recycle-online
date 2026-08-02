# Project status

Where the work has actually got to. CLAUDE.md holds the static
infrastructure — architecture, hard rules, machine traps, workflow —
and says nothing about progress; everything that moves as phases land
is here.

Update this file at every phase boundary. Nothing enters it that has
not been OBSERVED: a proof that ran, an endpoint that answered, a
screen seen on a device. Implemented is not verified, and a dated
green in here is only as fresh as its date.

**Last updated: 2026-08-02 — the daily money view MOBILE SCREEN, proven headless.
NOT yet seen on a device.**

## Current phase

**A1 — daily money view, mobile screen. UI only, no server changes. HEADLESS
GREEN, DEVICE-UNVERIFIED.** The endpoint has had no caller but `curl` since it
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

## Previous phase

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

## Earlier phases

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

No phase is in progress and the next one has not been chosen. Per the
CLAUDE.md workflow, this is a boundary: stop for review.

## What is built

### `server/` — running API

- **Schema**, migrations `0001`–`0004` in `server/migrations/versions/`:
  `tenants`, `users` (role `admin`|`staff`), `uoms`,
  `product_categories`, `products`, `product_prices` (grade A–D),
  `sellers` (grade, id_number, address, vehicle_no — per SRS 1.6),
  `purchase_bills`, `purchase_bill_items`. The four master-data tables
  carry `is_active` (0004). Row-level security is FORCEd per tenant; the
  runtime role `recycle_app` is NOSUPERUSER + NOBYPASSRLS and holds
  DML only.
- **Endpoints** (`server/app/`). Open to any signed-in user: `GET /health`,
  `POST /auth/login`, `GET /whoami`, `GET /products`, `GET /sellers`,
  `GET /uoms`, `GET /product-categories`, `POST /bills`, `GET /bills`,
  `GET /bills/{id}`. **Admin only**: `POST /bills/{id}/void`,
  `POST`+`PATCH` on `/uoms`, `/product-categories`, `/products`,
  `/sellers`, `PUT /products/{id}/prices/{grade}`, and
  `POST /{entity}/{id}/deactivate`+`/activate` on all four, and
  `GET /reports/daily`. Every request
  is scoped to its token's tenant with `SET LOCAL` inside the request
  transaction. `code` is immutable after create on every entity — it is
  what a historical bill is read against.
- **Proofs** — ten scripts in `server/scripts/`, each exercising a
  real path against a live database: `prove_rls`, `prove_auth`,
  `prove_master`, `prove_bills`, `prove_master_data_gate`,
  `prove_shop_time`, `prove_seller_pricing`, `prove_backup_restore`,
  `prove_master_write`, `prove_daily_report`. Each must pass twice in a row without
  reseeding (`lessons/proof-must-run-twice.md`). `seed_dev.py` loads
  the dev fixture — now an `admin` AND a `staff` user per tenant, since
  a role gate cannot be proven without a token that gets refused.
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
- **Screens** (`App.tsx`, `app/`): login, cart entry with numpad,
  per-bill seller picker, master-data strip with freshness state,
  status strip and operator notices, bills panel with the void flow.
- **The owner's screen** (`app/DailyScreen.tsx`, `src/reports/dailyView.ts`):
  the day's total, the permanent understatement caveat, voided bills, voids
  applied today against older bills, off-list payments, and the bill list. Read
  only; needs the server; renders calmly when it cannot have one.
- **Proofs**: THIRTEEN headless `npm run prove:*` scripts —
  `sync`, `sqlite`, `money`, `cart`, `entry`, `seller`, `notice`,
  `void`, `time`, `cold`, `clock`, `daily`, `forbidden`. `prove:forbidden` is the
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
- **NO SIGN-OUT. A shop cannot change who the phone is logged in as.**
  **A SECURITY item, not a convenience one — it belongs in A3.**

  Read out of the files rather than assumed: `TokenStore.clear()` EXISTS and
  `SecureTokenStore` implements it (`SecureStore.deleteItemAsync`). **Nothing
  calls it.** `App.tsx` calls `load()` at boot (line 449) and `save()` on sign-in
  (line 727) and that is all — there is no sign-out button, no menu, no path of
  any kind. `expo-secure-store` puts the token in the iOS **Keychain**, which
  survives deleting Expo Go, so reinstalling the app does not clear it either.

  Bound it honestly, because the exposure is not unlimited: `JWT_TTL_SECONDS`
  defaults to 3600 and there is no refresh token, so an issued token stops being
  accepted within the hour. What is missing is any way to end a session
  **deliberately, at the moment someone leaves** — and any way to end it from the
  server side at all. Between the handover and the expiry, bills written on that
  phone are attributed in `purchase_bills` to the person who left. On a system
  whose entire subject is real money, that is the audit trail naming the wrong
  person.

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
- **A back office to drive any of it.** The whole master-data write path
  now exists and is proven over HTTP, but the only thing that can call it
  is `curl`. `desktop/` is still empty, and the yard app is deliberately
  read-only for master data — so a shop still cannot set up its own
  products, prices or sellers without someone running requests by hand.
- **A daily money view — the server half AND a mobile screen now exist**
  (`GET /reports/daily`; `app/DailyScreen.tsx`, see Current phase). An owner can
  open it on a phone. It is **device-unverified**, and the desktop back office
  still has no version of it — a shop owner who works from a PC still cannot see
  the day's takings there.

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
- **`src/device/secureTokenStore.ts`**: that SecureStore honours the
  contract is unverified off-device.
- **The daily money screen: ONE pass, 2026-08-02, real iPhone, ADMIN only.**
  Rendering, day stepping and the offline path are observed (see Current phase).
  What that pass settled, worth naming because each was listed as a risk before
  it: `new Date()` on a SIX-DIGIT fractional-second ISO string with a `+07:00`
  offset parses under Hermes (times rendered, not `—`), and the 44pt
  `adjustsFontSizeToFit` amount is readable at a real width.

  What it did NOT touch, and must not be reported as working:
  - **the 403 rendering** — never drawn on a device, because the Keychain token
    could not be discarded. See Current phase and the sign-out blocker.
  - **the 20s `AbortController` timeout.** The offline test killed the network,
    which throws immediately; a server that ACCEPTS the connection and then never
    answers is the case the timeout exists for, and it has not been staged. The
    sync engine already relies on the same mechanism (`httpTransport`), so this is
    not new to the app — but it has never been the thing standing between an owner
    and an endless spinner.
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
  Read out of `purchase_bills`, not off the screens:

  | doc_no | device | total | device_created_at | server_received_at |
  |---|---|---|---|---|
  | B-2569-222 | iPhone | 220.00 | 03:24:37.235 | 03:24:37.446 |
  | B-2569-223 | Android | 11007.50 | 04:04:02.465 | 04:04:03.233 |
  | B-2569-224 | Android | 210.00 | 04:09:19.017 | 04:09:43.765 |
  | B-2569-225 | iPhone | 1075.00 | 04:09:18.892 | 04:09:43.923 |

  Contiguous, one bill each, no duplicate and no skipped number. 222 is
  NOT a fresh tap: it is the same row as the 403 pass above (id
  `735ed2aa…`, 220.00), 39 minutes earlier — the ordering claim
  iOS-then-Android holds, the "back to back" impression does not.
  Devices identified from the uvicorn log by client IP (iPhone
  `.243` throughout; Android `.250`, then `.248` after rejoining the
  network — that address made exactly ONE request in its life, a
  `POST /bills` that returned 201, which it could only do with a token
  it already held, so it is the same handset on a new DHCP lease).

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
  | `mobile/src/time/shopTime.ts:127` | SOUND — the one client authority; `getUTCFullYear()` on an already-shifted branded `ShopWallClock` |
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
- 2026-07-29 — **proof debris measured, tenant A: 301 bills, 248 active, 53
  voided.** By originating script (idempotency-key prefix): `bill` 92/69
  active, `mw` 56/46, `selpx` 44/44, `daily` 36/28, `mdgate` 20/20,
  `shoptime` 14/14, **`backup` 10/0**. Only `prove_backup_restore` leaves
  nothing live, because it is the only one that voids its own fixture.
  **37 active proof bills landed on today** — a day `GET /reports/daily`
  now shows, mixed in with the 4 real device bills. `prove_daily_report`
  contributes 0 to that: its fixtures are quarantined on 2019-03-14. No
  master-data debris is created by any current script; the pinned
  `PROD-f0c445f2` / `SELL-f0c445f2` pair is an artifact of a pre-fix
  version of `prove_master_write`, which now writes that bill against the
  SEEDED product and seller.
