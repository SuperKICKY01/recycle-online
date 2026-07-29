# Project status

Where the work has actually got to. CLAUDE.md holds the static
infrastructure — architecture, hard rules, machine traps, workflow —
and says nothing about progress; everything that moves as phases land
is here.

Update this file at every phase boundary. Nothing enters it that has
not been OBSERVED: a proof that ran, an endpoint that answered, a
screen seen on a device. Implemented is not verified, and a dated
green in here is only as fresh as its date.

**Last updated: 2026-07-29, at the close of the client-side 403 work
(mobile only; the server was not touched).**

## Current phase

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

## Previous phase

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
  `POST /{entity}/{id}/deactivate`+`/activate` on all four. Every request
  is scoped to its token's tenant with `SET LOCAL` inside the request
  transaction. `code` is immutable after create on every entity — it is
  what a historical bill is read against.
- **Proofs** — nine scripts in `server/scripts/`, each exercising a
  real path against a live database: `prove_rls`, `prove_auth`,
  `prove_master`, `prove_bills`, `prove_master_data_gate`,
  `prove_shop_time`, `prove_seller_pricing`, `prove_backup_restore`,
  `prove_master_write`. Each must pass twice in a row without
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
- **Proofs**: twelve headless `npm run prove:*` scripts —
  `sync`, `sqlite`, `money`, `cart`, `entry`, `seller`, `notice`,
  `void`, `time`, `cold`, `clock`, `forbidden`. `prove:forbidden` is the
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
- **A back office to drive any of it.** The whole master-data write path
  now exists and is proven over HTTP, but the only thing that can call it
  is `curl`. `desktop/` is still empty, and the yard app is deliberately
  read-only for master data — so a shop still cannot set up its own
  products, prices or sellers without someone running requests by hand.
- **A daily money view.** What was bought and paid out today. The
  bills exist; nothing totals them for the person who has to balance
  the cash.

## Known device gaps

Everything here is unverified, not broken. It is listed so no one
reports it as proven.

- **Android has never been run.** Every device pass so far has been
  on a real iPhone. Nothing Android-specific has been observed —
  treat any claim about it as unverified.
- **`src/device/expoSqliteDriver.ts` has no headless proof.** It
  cannot run under node (ESM with extensionless specifiers that only
  Metro resolves, plus `requireNativeModule('ExpoSQLite')`), so it is
  exercised only by manual device passes. Its transaction path
  genuinely differs from the node driver: expo-sqlite's
  `withExclusiveTransactionAsync` hands the callback its OWN
  connection, so isolation comes from SQLite's file write-lock plus
  `busy_timeout`, not the JS mutex. That `changes` is reported
  honestly is an assumption the store methods rest on.
- **`src/device/secureTokenStore.ts`**: that SecureStore honours the
  contract is unverified off-device.
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
