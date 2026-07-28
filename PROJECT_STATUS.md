# Project status

Where the work has actually got to. CLAUDE.md holds the static
infrastructure — architecture, hard rules, machine traps, workflow —
and says nothing about progress; everything that moves as phases land
is here.

Update this file at every phase boundary. Nothing enters it that has
not been OBSERVED: a proof that ran, an endpoint that answered, a
screen seen on a device. Implemented is not verified, and a dated
green in here is only as fresh as its date.

**Last updated: 2026-07-28, at the close of the backup/restore work.**

## Current phase

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

- **Schema**, migrations `0001`–`0003` in `server/migrations/versions/`:
  `tenants`, `users` (role `admin`|`staff`), `uoms`,
  `product_categories`, `products`, `product_prices` (grade A–D),
  `sellers` (grade lives here, per SRS 1.6), `purchase_bills`,
  `purchase_bill_items`. Row-level security is FORCEd per tenant; the
  runtime role `recycle_app` is NOSUPERUSER + NOBYPASSRLS and holds
  DML only.
- **Endpoints** (`server/app/`): `GET /health`, `POST /auth/login`,
  `GET /whoami`, `GET /products`, `GET /sellers`, `POST /bills`,
  `GET /bills`, `GET /bills/{id}`, `POST /bills/{id}/void`. Every
  request is scoped to its token's tenant with `SET LOCAL` inside the
  request transaction.
- **Proofs** — eight scripts in `server/scripts/`, each exercising a
  real path against a live database: `prove_rls`, `prove_auth`,
  `prove_master`, `prove_bills`, `prove_master_data_gate`,
  `prove_shop_time`, `prove_seller_pricing`,
  `prove_backup_restore`. Each must pass twice in a row without
  reseeding (`lessons/proof-must-run-twice.md`). `seed_dev.py` loads
  the dev fixture.
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
- **Proofs**: eleven headless `npm run prove:*` scripts —
  `sync`, `sqlite`, `money`, `cart`, `entry`, `seller`, `notice`,
  `void`, `time`, `cold`, `clock`.

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
- **A master-data write path.** `/products` and `/sellers` are
  read-only (`server/app/master.py` exposes GET only), so a shop
  cannot enter its own products, prices or sellers by any route that
  is not a seed script.
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
- The other server and mobile proof scripts were NOT re-run for this
  update (no app changes). Their last green is the phase that wrote
  them.
