# Architecture

**What this file is.** The single description of how this system is put together:
what the pieces are, what talks to what, **where each rule is ENFORCED**, and what
may not be changed without a decision. A session that has just booted, or a
reviewer who will not open the code, should be able to answer those four questions
from this file alone.

**What it is not.** It carries no progress and no order. Where the work has got to
is `PROJECT_STATUS.md § What is built`; the ORDER of what is not done is
`ROADMAP.md § What next, and why that`; the unranked queue is
`OPEN_ITEMS.md § Blocking one real paying shop`; the map from the requirements
document to what exists is `SRS_MAP.md § 1. The map, item by item`.

**It also does not restate the rules.** `CLAUDE.md § Hard rules` holds their
normative text and `BRIEFING.md § 4. The invariants` holds the same eight in plain
language for a reader who will not open the code — two registers, deliberately.
This file cites both and re-words neither. A third phrasing would be a third thing
to keep in agreement, which is `CLAUDE.md § Scope and status` "Do not restate any
of it here" applied to rules instead of status. What this file adds is the one
thing neither of them says: **which layer actually enforces each rule.**

**Citations.** `file § Section` plus a quoted handle, never a line number into a
document — a three-line insert into `CLAUDE.md` once invalidated twenty pointers
at once, and the shift was not uniform. Line numbers into CODE are used freely,
are expected to drift, and should be re-derived rather than trusted.

**Freshness.** Structure decays more slowly than status, but it decays. Everything
counted here was measured at commit `3babd52` on 2026-08-07, from the source files
and the migrations. Re-derive before resting a decision on a number.

---

## 1. What this system is

A management system for recycling and scrap-buying yards in Thailand, sold as a
monthly-licence SaaS to many shops at once. A yard buys scrap over a weighbridge,
pays cash on the spot, and owes the seller a purchase bill for every load. Two
kinds of user work in a shop: **yard staff** on a phone beside the truck, often
with no signal, and the **owner or back office** on a PC. A third party exists
outside every shop — **the provider**, who sells and operates the service, and who
today has no seat in the system at all (§2.2).

Three properties shape every file, and they are not features:

- **Real money.** These rows are cash that has already left a till. Nothing is
  deleted and nothing historical is recomputed.
- **Offline-first.** The load is tipped on the pile whether or not there is signal,
  so the phone must complete a purchase without a network. The phone is therefore
  the first writer and the server is the authority, and the gap between them is a
  visible state rather than something the UI smooths over.
- **Multi-tenant.** One shop's rows and another's sit in the same tables in the
  same database, and it is the storage layer rather than the application that
  declines to return a shop the wrong ones.

---

## 2. The programs, and the boundaries between them

### 2.1 The three built programs

`CLAUDE.md § Architecture` is the normative statement and is LOCKED; the reasoning
is `BRIEFING.md § 2. Architecture` "One authority, or two answers." Neither is
repeated here. In outline:

| program | stack | role | state at `3babd52` |
|---|---|---|---|
| `server/` | FastAPI + PostgreSQL | single source of truth; every business rule | running API, 5 migrations applied |
| `mobile/` | React Native + Expo | yard floor: create purchase bills, offline-first | built, device-proven in parts |
| `desktop/` | Electron + React + TypeScript | back office: master data, bill viewing, ESC/POS thermal slips | **empty** — `git ls-files desktop/` returns one path, `desktop/.gitkeep`, 0 bytes |

The boundary that matters is one sentence in `CLAUDE.md § Architecture` "Mobile and
desktop are both clients of the same API": **neither client opens a database
connection and neither implements a business rule.** Structurally this is currently
true by absence as well as by rule — the only PostgreSQL clients in the tree are
`server/app/` and `server/scripts/`, and `mobile/` speaks to SQLite (its own local
store) and to HTTP, nothing else.

### 2.2 The provider service — decided, unbuilt, and this is its first home

**No document in this repository has described this program.** Its absence — there
is currently no way for the vendor to be a user of this system — is recorded at
`SRS_MAP.md § 7b. The provider has no seat` "vendor to be a user of this system",
which deliberately proposes nothing. The owner has since settled its shape. It is
recorded here as **decided and NOT built**; nothing below exists in any file,
table or endpoint.

**A fourth program: a separate service, with its own principal table and its own
secret.** Not a third role inside `users`, and not an endpoint added to the shop
API under a privileged role. The decisions and their reasoning are §10 (D1, D2,
D3). The constraints it must honour, stated as structure rather than design:

- Its principals live in a **`provider_users` table outside the tenant model.**
  `users` is not touched — not `tenant_id`'s NOT NULL, not `role`'s CHECK, not the
  `tenant_isolation` policy.
- It reads across shops **the way `reconcile.py` already does**: setting the tenant
  GUC per shop inside one transaction. **No `BYPASSRLS` role is created.**
- It **writes an audit record from its first day** — every provider read of a
  shop's data, and every master-data write with its author.

Everything else about it — transport, hosting, session model, what it can see, how
a licence is enforced — is undecided and is not designed here. Licensing in
particular is unbuilt in the full sense:
`SRS_MAP.md § 7a. How a licence is enforced` measured zero hits for licence,
subscription, activation, expiry and billing across the tracked non-lockfile
tree. This file names that as unbuilt and says nothing more about it.

### 2.3 A tension, recorded and not resolved

`CLAUDE.md § Architecture` is marked LOCKED and enumerates **three** programs. This
file records a **fourth** as decided and unbuilt. **`CLAUDE.md` has not been
amended, and amending it is a separate phase requiring the owner's confirmation.**

Both statements are true about different things — `CLAUDE.md`'s three are the
programs a shop uses, and the provider service is not one of them — but a reader
who finds only one of the two documents will get a different count. That is the
whole of the tension, it is recorded rather than smoothed, and nobody should
resolve it by editing either file in passing.

### 2.4 What the requirements document says instead, and one divergence nothing records

`docs/SRS.md` "Desktop Application (Back-Office)" describes **two** platforms, not
three and not four — and describes them as *"ทำงานร่วมกันผ่าน Database เดียวกัน"*:
working together **through the same database, directly.**

That is the opposite of the built system, in which both clients are clients of one
API and neither touches the database.
`SRS_MAP.md § 4. SRS-versus-built contradictions` records that the SRS assigns bill
creation to Desktop and Mobile while only Mobile exists;
**it does not record the shared-database divergence**,
which is the larger of the two and is the reason the API exists at all. Recorded
here because no file held it.

---

## 3. Topology: who calls what

```
  mobile/ (Expo)                                    desktop/ (Electron)
    |                                                   |
    | HTTPS-to-be (plain HTTP today, app.json:30)       | (does not exist)
    v                                                   v
  +-------------------------------------------------------+
  |  server/  FastAPI          <-- the ONLY writer        |
  |    auth  bills  master  reports  users                |
  +-------------------------------------------------------+
                     |  asyncpg, role recycle_app
                     |  SET LOCAL app.tenant_id per transaction
                     v
  +-------------------------------------------------------+
  |  PostgreSQL 16   10 business tables, RLS ENABLE+FORCE |
  +-------------------------------------------------------+
       ^                                    ^
       | recycle_owner (Alembic only)       | postgres (superuser)
       |                                    | reconcile.py, backup/restore
```

Three things this picture is deliberately explicit about:

- **`mobile/` also writes to its own SQLite**, first and always, before any HTTP
  happens (§7). That store is not a cache of the server; it is the first writer.
- **`reconcile.py` is not part of the API.** It is a script, run by a person,
  holding a superuser connection alongside its per-tenant ones. It writes nothing.
  It is also the only cross-tenant reader that exists (§10, D2).
- **Transport is plain HTTP today.** `mobile/app.json:30` is
  `"apiBaseUrl": "http://192.168.1.238:8000"`, a LAN address. On a LAN that is a
  choice; `SRS_MAP.md § 6. Security posture, per area` "No transport security."
  states what it becomes the moment the API is reachable from outside one.

### 3.1 Three authentication tiers, not two

The API has three tiers, and the middle one is easy to miss because the
unauthenticated surface is small:

| tier | dependency | what is on it |
|---|---|---|
| **no authentication** | none | health, and login itself |
| **any signed-in principal** | `Depends(get_principal)` (`auth.py:91`) | reads, and bill creation |
| **admin only** | `Depends(require_admin)` (`auth.py:286`) | every master-data write, void, the daily report, session revocation |

**The endpoint list is deliberately NOT copied here.** It moves every phase, and a
copied list is wrong within one. `PROJECT_STATUS.md § What is built` "in THREE
categories, not two" holds the current membership of all three tiers, read off the
handlers. What belongs in an architecture file is that the three tiers exist and
where the gate is implemented — the list is status.

Two structural facts about the tiers:

- **Role is resolved from the database on every request, not from the token.** The
  token carries `role` as advisory display data; `get_principal` re-reads the
  `users` row under tenant context, so a demotion takes effect at once rather than
  at the next token expiry.
- **`admin`/`staff` is a two-value CHECK, not a permission system.** `auth.py:75`
  calls them "The only two roles there are", constrained at
  `0001_initial_schema.py:100`. The SRS asks for per-screen checkbox permissions;
  that is on the out-of-MVP list at
  `PROJECT_STATUS.md § What is NOT built` "do not build, do not scaffold".

---

## 4. The data model — ten business tables

Ten tables, created by five migrations, `0001` through `0005`, chained. `public`
holds an **eleventh relation, `alembic_version`**, which is Alembic's own
bookkeeping — it carries no tenant column, no RLS and no policy, and it is named
here only because "exactly ten tables" is a claim the next session re-derives with
`count(*)`, gets eleven, and mistrusts the file over.

| table | what it is for | shape worth knowing |
|---|---|---|
| `tenants` | one row per shop; the unit a licence would attach to | `(id, name, created_at)` and nothing else — no address, no phone. **No endpoint reads it** <br>**Superseded 2026-08-30 (unanchored; anchor next pass):** re-derived from `information_schema.columns`, the row is now `(id, name, created_at, default_grade, seller_code_target_holding, address, phone)` — `default_grade` (migration 0010), `seller_code_target_holding` (0012), `address`+`phone` (0013). It IS read and written: `GET /shop` returns it (staff-readable) and `PATCH /shop` writes `default_grade`/`address`/`phone` (admin-only), so "no endpoint reads it" went false at `9ad225e`. `name` stays immutable-by-decision (`9ad225e`). |
| `users` | authentication, not an employee master | `tenant_id NOT NULL`; `role` CHECK 2 values; `token_version` (0005). No `is_active`, so a session can be revoked but an account cannot be locked |
| `uoms` | units of measure (kg, crate, piece) | `(code, name)` + `is_active` |
| `product_categories` | paper, steel, copper … | `(code, name)` + `is_active` |
| `products` | what a yard buys | composite FKs to category and uom + `is_active`. **No sell price, no stock column** |
| `product_prices` | the CURRENT buy list, per product per grade | `UNIQUE (tenant_id, product_id, grade)`, grade CHECK `A`–`D`. Historical bills never read back from here |
| `sellers` | who sells to the yard | grade selects the price tier; `id_number`/`address`/`vehicle_no` added by 0004 (SRS 1.6) + `is_active` |
| `purchase_bills` | the bill header — one load, one bill | client-supplied `id` (no default), nullable `doc_no`, `idempotency_key`, two timestamps, three void columns |
| `purchase_bill_items` | the money lines | three weights, both prices, stored `amount`, `line_no` |
| `doc_no_counters` | the gap-free document sequence | `PRIMARY KEY (tenant_id, be_year)`, one row per shop per Buddhist year (0002) |

**Why the shape is this shape**, in four points that are not obvious from the
column list:

1. **Every foreign key is composite and carries `tenant_id`.**
   `0001_initial_schema.py:28-37` sets this out: a plain
   `purchase_bills.seller_id -> sellers.id` would not stop a bill in shop X
   pointing at a seller in shop Y, so every reference is
   `FOREIGN KEY (tenant_id, child_id) REFERENCES parent (tenant_id, id)` against a
   `UNIQUE (tenant_id, id)` on the parent. This is **independent of RLS and
   stronger than it**: referential-integrity checks in Postgres bypass row
   security, so the guarantee holds whatever the session's tenant context is, and
   no policy can be tricked into skipping it.

2. **Bill and item ids have NO default; every other primary key defaults to
   `gen_random_uuid()`.** The two exceptions are exactly the two tables the phone
   writes: it must be able to name a bill with no network. `doc_no` is nullable for
   the same reason, and its uniqueness is a **partial** index
   (`WHERE doc_no IS NOT NULL`) so many not-yet-synced bills can coexist.

3. **A bill is either wholly live or wholly void.** `ck_bills_void_consistency`
   (`0001_initial_schema.py:224-228`) requires `voided_at`, `voided_by` and
   `void_reason` to move together, and `voided_by` is a composite FK into `users`
   **in the same tenant**. There is no delete route anywhere.

4. **`users.id` is the only permanent name a person has here; the username is
   not one.** `0001_initial_schema.py:95-106` gives `users` a `uuid PRIMARY KEY`
   and puts the username under `CONSTRAINT uq_users_tenant_username UNIQUE
   (tenant_id, username)` — **per tenant, not global**. Two shops may each hold a
   `somchai`, and they are different people. Nothing in the schema makes the
   column immutable either: it is bare `text`, no trigger and no check, so an
   `UPDATE` is available the moment anyone wants a rename. **No route performs
   one at `a471dc2`** — the string `username` appears in `server/app/users.py` in
   selects, an insert and returning-clauses only, never in a `SET`. That is the
   state of the code, not a property of the design, and it is exactly the kind of
   sentence that goes false without announcing it.

   **The consequence is for anything that STORES an identity rather than
   displaying one.** A username written into a row records who someone was called
   at the moment of writing, and it survives a rename or a re-issue to a new
   employee by pointing at whoever holds the string now — or at nobody. So the
   pair that identifies an owner is `(tenant_id, user_id)` and never a username;
   the phone's `local_identity` table stores exactly that pair, and the login
   response returns `user_id` for this reason and not as a convenience. A
   username belongs on a SCREEN, where a human resolves it in context.

**Retirement, not deletion.** Four master-data tables carry `is_active` (0004).
A row referenced by a bill can never be removed, so retirement is what "take it out
of the picker" means: the row keeps its code and name, keeps answering every
historical bill, and stops being offered for new work. List endpoints exclude
retired rows; **row-level reads never filter**, which is what makes "the bill stays
intact" observable through the real path rather than only in SQL.

---

## 5. Money: three representations across three boundaries

**Money is never a number in any language's numeric type, at any point on the
path.** It has three representations and crosses three boundaries, and that
sentence is the shape of the whole thing:

| boundary | representation | where it is fixed |
|---|---|---|
| PostgreSQL | `NUMERIC(14,2)` money, `NUMERIC(14,3)` weight | `0001_initial_schema.py:170, 206, 254-259` — eight NUMERIC columns, no float column anywhere |
| the wire (JSON) | **a decimal STRING** | `server/app/reports.py:224-230` "Decimal in, string out"; `server/app/master.py:56`; refused on the client at `mobile/src/reports/dailyView.ts:197` |
| mobile SQLite | **`TEXT`** | `mobile/src/adapters/sqlite/schema.ts:4-18` |

Each has its own failure mode, and they are different:

- **In Postgres**, a float column would accumulate an error nobody can later
  explain. It is a schema property: there is no float to reach for.
- **On the wire**, a JSON number is a double before any client code runs, so the
  damage is done in the parser. `dailyView.ts:37` therefore has `readMoney`
  **REFUSE** a JSON number outright rather than render whatever a double rounded to
  — a money field arriving as `1234.5` is treated as a missing field, not as
  `1234.50`. `dailyView.ts:191` states why: a JSON number here means a float
  already travelled.
- **In SQLite**, NUMERIC *affinity* silently converts a decimal string to a float,
  and `STRICT` does not protect a `TEXT` column. So the columns are `TEXT` and
  **the guarantee is the TypeScript type, not the database**. That is the one place
  in the system where an invariant has no storage-layer enforcement at all
  (`lessons/README.md § Lessons` "sqlite-money-is-text.md").

**Client arithmetic** uses `decimal.js` with precision raised to 50: the domain
needs about 28 significant digits for `NUMERIC(14,3) × NUMERIC(14,2)` and the
library defaults to 20, which rounds mid-multiply in silence.

**Rendering does not reformat.** Money reaches a screen as the server's string,
byte for byte — no parse, no `toFixed`, no grouping, no currency formatter. There
are no thousands separators, deliberately: grouping means splitting the string, and
splitting a money string is one edit from splitting it into numbers.

---

## 6. Time: two formatters, two constants, and nothing checks that they agree

Timestamps are stored as UTC instants and every bill carries two of them —
`device_created_at` (what the phone claims) and `server_received_at` (when the
server had it). That a handset's clock cannot be relied on is a measurement here
rather than a precaution: about 3 s of real skew was observed on this project's
own test handset, and a phone 14 hours fast was observed on another. **Every
report aggregates on `server_received_at`.**

Rendering converts to **shop time** — a fixed UTC+7 offset — and derives the
Buddhist-era year **after** that conversion. The other order is correct by luck for
most of the day and wrong across Bangkok midnight, and it is not merely a label:
`doc_no_counters` is keyed on `be_year`, so the wrong order opens the wrong
counter. พ.ศ. appears in the UI and on printed slips only
(`CLAUDE.md § Conventions` "Buddhist-era dates").

**The structural fact, which is stated in one direction only and asserted by
nothing:**

- The client authority is `mobile/src/time/shopTime.ts` — its own opening lines
  call it "the ONE place a timezone is defined on the client, the ONE place a year
  is computed".
- The server authority is `server/app/config.py:12-37` — "the ONE place a timezone
  is defined server-side".
- **They are two implementations of one constant.** `shopTime.ts:24-27` says so:
  *"The server holds the matching constant in app/config.py and the two must
  agree."* `config.py` does not mention the client. **No check, no proof and no
  reconciler assertion compares them.** Change `config.py:37` and nothing in the
  tree — no compiler, no proof, no document — reports that a second constant just
  went out of agreement.

**A fixed offset, not a named zone**, on both sides: the server box has no IANA
database (Windows ships none and `tzdata` is not installed) and Hermes' `Intl`
`timeZone` support is unverified on a real handset — a silently-ignored `timeZone`
would print UTC, which is the exact defect the module exists to fix. A per-tenant
zone that observes daylight saving cannot be a fixed offset and is a schema change
plus a device verification, not a config edit.

**The porting constraint**, carried here because it is a boundary between two
programs and one of them does not exist yet: when the desktop thermal slip is
built, it must **PORT** `shopTime.ts` — offset constant, brand and the ordering
rule — and never re-derive `+ 543` in Electron. `shopTime.ts:45-51` is the origin of
that requirement and states the reason: two implementations drift at exactly the
boundary neither author tested. The same sentence is already carried by
`ROADMAP.md`, `BRIEFING.md` and `PROJECT_STATUS.md`; it is referenced here, not
restated a fifth time.

---

## 7. The offline model: record state and failure class are different axes

These are two axes and they are routinely collapsed into one. Separating them is
this section's whole job.

**Axis 1 — a record's sync state. Four values, not three.**
`mobile/src/sync/types.ts:11` is
`type SyncState = "pending" | "syncing" | "synced" | "failed"`.

`CLAUDE.md § Hard rules` and `BRIEFING.md § 4. The invariants` both name three
(waiting, sent, failed). The fourth, **`syncing`, is the one a lesson exists for**:
an in-progress state that nothing polls strands the record forever if the process
dies mid-flight, so startup recovery must sweep it back to retryable
(`lessons/README.md § Lessons` "sync-state-needs-startup-recovery.md"). It is not a
fourth kind of outcome — it is the state a crash can leave behind, which is exactly
why it must be visible in the type.

There is also a **flag on `pending`, not a fifth state**: a bill parked on missing
master data is still owed and still pending, but is held out of the head-of-line
queue so it cannot dam the bills behind it. `types.ts:110-118` records why it is a
nullable column rather than a new `SyncState` value — `sync_state` carries a CHECK
constraint written into `CREATE TABLE`, and SQLite cannot alter a CHECK without
rebuilding a table that already holds the shop's unsynced bills.

**Axis 2 — what a failed attempt was ABOUT. Five classes.**
`mobile/src/sync/types.ts:247-318` is the authority. `SendOutcome` has seven
members; two are successes (`accepted`, `duplicate`) and five are failures:

| class | what it is about | what the queue does |
|---|---|---|
| `unavailable` | nobody answered, or the answer was lost | retry forever — an unknown outcome is not a negative verdict |
| `rejected` | this bill is malformed | terminal, visibly failed |
| `rejected_resolvable` | the bill is fine; the shop's master data is not set up | park — still owed, out of the sendable queue, retried when the office fixes it |
| `session_expired` | the caller is **nobody** (401) | one tap on this device fixes it; carries a sign-in button |
| `forbidden` | the caller **is** someone, and may not do this (403) | no tap here ever fixes it; names the shop owner |

**`PROJECT_STATUS.md § What is built` "three-way failure classification" is now
stale by two.** It was true when written; the fourth and fifth classes were added
in later phases and `types.ts:224-234` records the split explicitly. The count is
noted, not corrected — that file is not this phase's to edit (§12).

The two axes are independent: a bill can be `pending` because of `unavailable` or
because of `rejected_resolvable`, and those need opposite things from the operator.
Collapsing any two classes produces a bug that review cannot see, because every
layer stays internally correct while the screen tells the yard the wrong thing.

---

## 8. Where each invariant is enforced

**The distinction this section exists to protect:** an invariant enforced by a
database constraint, by an RLS policy, by an API check, and by a client guard are
four different strengths of claim. A file that blurs them lets a reader believe the
database is holding something the application is holding.

### 8.1 Rule by rule

Rule numbers and their text are `CLAUDE.md § Hard rules`. The labels below are
shorthand for locating the row, not the rule.

| # | shorthand | enforced by | strength |
|---|---|---|---|
| 1 | exact money and weight | **DB column types** — `NUMERIC(14,2)`/`(14,3)`, plus request-model scale limits that turn an over-scale value into a 422 instead of a silent round; **TypeScript only** in mobile SQLite (§5) | schema, except on the phone |
| 2 | one shop's rows only | **RLS policy** ENABLE + FORCE on all 10 tables, **plus composite FKs** that make cross-tenant references impossible independently of RLS (§8.2) | schema + policy, two independent mechanisms |
| 3 | server-issued document number | split — see the two rows below | |
| 3a | a bill has no number until it syncs | **DB**: `doc_no` nullable, partial unique index; **client**: the screen must say so | schema + client |
| 3b | **the series is gap-free** | **APPLICATION CODE ONLY** — `bills.py` increments a locked counter row; **CHECKED AFTER THE FACT** by `reconcile.py:1037` (T8) | **not a schema guarantee** |
| 4 | a repeat must not buy twice | **DB constraint** `uq_bills_tenant_idem UNIQUE (tenant_id, idempotency_key)`, with the handler re-SELECTing the key on a race | schema |
| 5 | no deletes on transactions | **DB constraint** `ck_bills_void_consistency` + composite FK on `voided_by`; **and by absence** — there is no delete route (observed 405) | schema + absence |
| 6 | all three weights, both prices, stored amount | **DB columns**, all NOT NULL, plus `ck_items_net CHECK (net_weight = gross_weight - tare_weight)` | schema |
| 7 | keep both timestamps | **DB columns**, both NOT NULL; `server_received_at` written explicitly from the transaction's own clock, not left to the default | schema |
| 8 | write locally first, failure visible | **CLIENT ONLY, by definition** — it is a statement about an app on a phone. No server constraint can express it and none does | client, proofs only |
| — | **an account that can be locked** — NOT one of the eight; see the note below the next two | **DB column** `users.is_active` NOT NULL DEFAULT true (0007), plus **TWO application checks** that both have to be there: `main.py`'s login refuses a locked account, and `auth.py`'s `get_principal` refuses the tokens it already holds. The lock bumps `token_version` in the SAME `UPDATE`, so ending the live sessions is a property of the statement rather than of a second call | schema for the column, application for both checks |

**The two rows that must not be misread:**

- **Rule 3b — `doc_no` gap-freeness is application-enforced and
  reconciler-checked, and is NOT a database guarantee.** No unique index and no
  CHECK produces it. A native `SEQUENCE` was deliberately rejected because
  sequences are *not* gap-free — `nextval` does not roll back on abort — so the
  system uses a counter row taken under a row lock
  (`0002_bills_docno_and_vehicle.py:13-15`). What the schema does enforce is
  *uniqueness* (the partial index); *contiguity* is produced by code and verified
  by an instrument a human has to run. T8 at `reconcile.py:1037` is that
  instrument: `doc_no per (tenant, be_year) runs 1..N — no gap, no duplicate`.
  Anyone reading "gap-free" as a constraint will look for one and not find it.

- **Rule 8 is client-only by definition, and that is not a weakness to be fixed.**
  Local-first writing and visible sync state are properties of an app running on a
  handset; the server cannot observe them, and the daily report says so — its
  understatement caveat is a constant `true` because there is no device registry,
  no heartbeat and no device column, so the server has no evidence with which to
  ever claim a day is complete. The enforcement is the mobile proof suite and
  device passes, and nothing else.

**And the row with no number, added 2026-08-07 by migration 0007.** It is in
that table because this section is about WHERE AN INVARIANT IS ENFORCED and the
answer for account locking is genuinely split across three places, which is
exactly the kind of thing a reader gets wrong. **It is not a ninth hard rule**
— `CLAUDE.md § Hard rules` still holds eight and this file does not add to them.

**The ORDER of the two application checks is load-bearing, and this is the one
structural fact about them worth carrying here.** In `get_principal` the account
check runs BEFORE the session-version check. That is not style: because a lock
bumps `token_version` in the same statement, both guards are true of every token
alive when the lock lands, so the reverse order leaves the account check
**unreachable through every path the product has** — a token whose version is
current but whose account is locked cannot be minted, because minting one needs a
login and login refuses a locked account. Ordered first, the account check names
the durable fact and deleting it changes only the refusal's `code`
(`account_inactive` becomes `token_revoked`), never its status. Both halves of
that were measured; the record is
`PROJECT_STATUS.md § Baseline observations` "57 of 57" and the generalisation
is the seventh mechanism in
`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md".

### 8.2 Tenant isolation, in full

The most heavily enforced property in the system, and the one whose enforcement is
spread across the most files. The rule is
`CLAUDE.md § Hard rules` "Enforce at the lowest layer possible";
this is where each layer of it lives.

| layer | site | what it does |
|---|---|---|
| policy, 9 tables | `0001_initial_schema.py:276-284` | `ENABLE` + `FORCE ROW LEVEL SECURITY`, then `CREATE POLICY tenant_isolation … USING (key = …) WITH CHECK (key = …)`, keyed on `tenant_id` — except `tenants`, keyed on its own `id` |
| **policy, the 10th table** | `0002_bills_docno_and_vehicle.py:47-52` | `doc_no_counters` gets the same three statements, **in a different migration** |
| the predicate | `0001_initial_schema.py:62` | `NULLIF(current_setting('app.tenant_id', true), '')::uuid` — unset or empty becomes NULL, the predicate becomes unknown, **no rows** |
| context, per request | `server/app/db.py:86-91` | `conn.begin()`, then `set_config('app.tenant_id', :t, true)` — the third argument is what makes it `SET LOCAL`, transaction-scoped, unable to leak across a pooled connection |
| the roles | `server/db/init/00_init_roles.sql` (the `CREATE ROLE` blocks) | all three of `recycle_owner`, `recycle_app` and `recycle_directory` are `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`. `FORCE` is what makes the policy bind the owner too |
| structural backstop | `0001_initial_schema.py:28-37` | composite tenant-carrying FKs (§4) — holds even where RLS does not apply |
| asserted by | `reconcile.py:877-887` (S4, role attributes), `prove_rls.py` | the roles and the policies are checked, not assumed |

**A reader of migration `0001` alone counts NINE policies and will conclude that a
table is unprotected.** The tenth, on `doc_no_counters`, is in `0002` because the
table did not exist in `0001`. Nothing is wrong; the enumeration is simply split
across two files, and the split has to be stated somewhere or it reads as a hole.

**One by-design exception, and it is the login path.** Every tenant context comes
from the caller's token except in `server/app/main.py`'s `login` handler — the
`tenant_connection(body.tenant_id)` call, named rather than cited by line so it
does not rot — where no token exists
yet and the tenant comes from the request body as a submitted identity claim. RLS
then guarantees the lookup can only see that tenant's users, so there is no
cross-tenant login. It is the one place the rule "the tenant comes from the token"
does not apply, and it is deliberate.

**WHAT THIS COVERS AND WHAT IT DOES NOT, MEASURED RATHER THAN ARGUED.** Every
layer in the table above is real, and none of them decides WHICH tenant. That is
decided by a GUC the application role sets for itself, so the isolation is
complete against a handler that forgets a filter and is NOT a defence against
anything able to execute SQL as `recycle_app`.

Measured on this cluster, from ONE `recycle_app` connection, changing nothing but
`app.tenant_id`. With no context set: `tenants` 0 rows, `purchase_bills` 0 rows.
Context set to tenant A: `purchase_bills` 376. Set to tenant B: 9. Both match what
the superuser reads per tenant, and `count(DISTINCT tenant_id)` was 1 each time —
so the GUC selects the shop, and nothing between the connection and the rows
checks whether that role is entitled to the shop it named.

Two controls ran on the same connection and were both REFUSED: `SET
log_min_messages` and `SET session_replication_role` each raised `permission
denied to set parameter`. The reading above is therefore not "this role can set
anything" — `app.tenant_id` is settable by it and other parameters are not.

What the property still buys is worth keeping and is the reason for the design: a
forgotten `WHERE` returns NOTHING rather than everything, and `FORCE` means the
owner cannot skip a policy either. What it does not buy is protection from SQL
injection, or from anything else running statements as that role. That is covered
elsewhere — parameterised queries in every handler, and the directory reader being
a separate role holding no `USAGE` on schema `public`. That last one bounds what
the pre-authentication lookup can reach; it does not bound `recycle_app`, and a
deployment may hold both sets of credentials in one process.

---

## 9. What is LOCKED, and what is open

**LOCKED** — carried from `CLAUDE.md § Architecture`, which is where the list
lives and where any change to it must be made. Do not propose alternatives; do
help defend them.

- The three programs and their stacks (§2.1).
- One API as the only writer; no client touches the database; no client
  implements a business rule.
- The eight hard rules, `CLAUDE.md § Hard rules`.

**Settled but recorded here rather than in `CLAUDE.md`** — §10, D1 through **D4**.
These are decisions, not proposals, and none of them is built.

**Open, and named as open** (each is somebody's decision, none is designed here):

- **Where master-data screens live** — mobile or desktop. Tracked as a fork in
  `ROADMAP.md`; it changes which programs exist on the path to a first shop.
- **How a licence is enforced.** Nothing exists (§2.2).
- **Whether a per-tenant timezone is needed**, which turns §6's constant pair into
  a schema change.
- **Whether `GET /bills` should be shop-wide for staff**, which decides whether
  the daily report's admin gate is a confidentiality boundary or defence in depth.

---

## 10. The three settled decisions

Recorded as decided, with the reasoning, because they existed only in conversation.
**None of the four is built. No implementation is designed here.**
**There are FIVE — D4 and D5 were appended 2026-08-10 and the heading was
deliberately left saying "three"**, because six citations resolve to it by name;
the reason is stated at D4 itself. **D5 is the exception to the sentence above:
it is not an unbuilt design but a statement about which database this project is
running on, and it is settled rather than proposed.**

**THERE ARE NOW NINE. D6 through D9 were appended later on the same day,
2026-08-10, and the heading still says "three" for the reason D4 gives.** The
count in the sentence above is left exactly as it was written, for the reason §13
gives about counts in preambles: **treat the LIST below as the authority on its
own length, never this paragraph.** Re-measured when D6 was written, **THIRTEEN
citations now resolve to this heading by name** — `ROADMAP.md` ×8,
`PROJECT_STATUS.md` ×3, `OPEN_ITEMS.md` ×1, `SRS_MAP.md` ×1 — counted two ways
that share no mechanism, `tools/verify_citations.ps1` over all six citing sources
and a ripgrep count of the literal string, both returning 13. D4's "six" was true
when D4 was written and is not edited.

**D6 THROUGH D9 ARE ACCOUNT PROVISIONING, AND AT `a73c264` NOT ONE OF THEM IS
BUILT** — no endpoint, no migration, no column, no line of code. The preamble's
first sentence therefore covers them unchanged. They record a SHAPE and the
reasoning behind it, the way D4 does; no implementation is designed here either.

**THAT SENTENCE IS PINNED TO A COMMIT BECAUSE IT WAS ALREADY MOVING AS IT WAS
WRITTEN**, which is the failure §13 records as a sentence false within the same day
it was made. Observed here rather than reported: while D6 was being written,
`git status --porcelain` carried ` M server/app/users.py` and
`A server/scripts/prove_user_create.py` from a SECOND session working this same
tree, and `server/app/users.py:380` holds
`@router.post("/users", status_code=status.HTTP_201_CREATED)` behind
`Depends(require_admin)` — **route 1 of the three, WRITTEN.** It is not committed,
nothing here ran it, and routes 2 and 3 are absent. So, precisely: **unbuilt at
HEAD; route 1 written in the working tree; none of the three proven.** Read the
tree, never this paragraph.

**THE D-NUMBERS IN THIS FILE ARE THIS FILE'S OWN, AND THEY NOW COLLIDE WITH
`ROADMAP.md`'s.** That file has carried its own D1–D12 since 2026-08-07, and
**its D6, D7 and D9 are OPEN questions about entirely different subjects** — what
else goes in the shared package, what origin the desktop renderer presents to
CORS, and which stage owns Android. The collision is not new: D1 through D5
already meant different things in the two files. What D6 through D9 add is that a
sentence naming bare numbers is now genuinely ambiguous —
`ROADMAP.md § P2.6 — The decisions the pilot is the evidence for` requires
"D6, D7, D9 and D11" to carry an answer, and it means ROADMAP's three, not these.
**Never cite a bare D-number across files.** Neither space is renumbered, for the
reason this file already gives about headings: renumbering orphans every reference
to it.

### D1 — the provider gets a separate seat, not a third role

A `provider_users` table outside the tenant model, and a separate service with its
own secret. **`users` is not touched**: not `tenant_id`'s NOT NULL, not `role`'s
CHECK, not the RLS policy.

**Reasoning.** Relaxing `users.tenant_id` to nullable changes the meaning of every
row already written — a NULL would have to mean "belongs to no shop", which no
existing row was written to express. And all ten policies rest on a principal
having exactly one shop: the GUC holds one uuid and never a list, so "a user of
several shops" is not a thing the predicate can represent. The provider is not a
kind of shop user; making them one would be modelling convenience bought with the
property this system is strongest at.

Measured, at `3babd52`: `users.tenant_id` is
`uuid NOT NULL REFERENCES tenants (id)` at `0001_initial_schema.py:97`;
`users.role` is `text NOT NULL CHECK (role IN ('admin', 'staff'))` at
`0001_initial_schema.py:100`; `auth.py:75` calls those "The only two roles there
are".

### D2 — cross-tenant reads are a per-tenant loop, never a bypass

The provider service reads across shops the way `reconcile.py` already does —
setting the GUC per tenant inside one transaction — and **no `BYPASSRLS` role is
created.**

**Reasoning.** A bypass role is cluster-wide. Granting it would disable tenant
isolation for anything that uses it, on every database in the cluster, not just for
the caller that wanted it. This refusal is already enforced by instruments rather
than by comments: `reconcile.py:877-887` (S4) asserts both project roles are
`NOSUPERUSER` and `NOBYPASSRLS`, and `prove_reconcile.py:155` compiles
`\b(alter|create|drop)\s+role\b` and **refuses any injection whose SQL matches it**
(`:161-163`) — so the destructive proof cannot reach for the one statement that
would make S4 fire.

**AND THE QUESTION THIS DECISION USED TO LEAVE OPEN — what the provider service
enumerates tenants FROM — IS NOW ANSWERED: a dedicated relation outside the
tenant model.** It is `directory.shop_codes`, one row per shop, mapping a shop
code to a `tenant_id`. The migration that creates it is **committed and NOT YET
APPLIED to any cluster**, so nothing below describes a database that exists today.

The problem it solves is worth stating first, because it is not obvious. The
`tenants` policy is keyed on the table's own `id`. So under `recycle_app`: with
the GUC set, `SELECT id FROM tenants` returns exactly one row, its own; with the
GUC unset, it returns none. **The application role cannot produce the list that a
per-tenant loop needs in order to start.**

**Reasoning, against the two alternatives that were also on the table.** An owner
or superuser connection is the largest privilege in the system, and choosing it
would make the provider service a superuser client permanently. Carrying the
mapping on D1's `provider_users` would tie the shop list to who happens to hold a
provider account, so a shop with no provider row would be invisible to the very
service meant to oversee it. A relation outside the tenant model has neither
property: it sits outside RLS the way `alembic_version` already does, and it is
read by a THIRD role — `recycle_directory`, `NOSUPERUSER NOBYPASSRLS`, holding no
`USAGE` on schema `public` — which can therefore reach the shop list and nothing
else. The same relation also answers the login question (`ROADMAP.md` D4): a
lookup that turns a typed code into a `tenant_id` is the same lookup a provider
loop needs, and two relations for one mapping would be two things to keep in step.

The code is eight characters from a 31-character alphabet, immutable once issued,
one per shop enforced by `tenant_id` being the primary key. The alphabet, the
constraint and the measurements behind them live in that migration's docstring
and are deliberately not restated here.

**WHAT THIS DOES NOT CHANGE, AND IT IS WHAT A READER WILL GET WRONG.**
`reconcile.py` does NOT stop needing a superuser. Only the tenant listing at
`reconcile.py:663-668` is replaced by a directory read. X1, X2 and X3 are
`count(*)` and cross-tenant joins issued against the ten FORCE-RLS business
tables, and the gate at `reconcile.py:627` refuses on the `is_superuser`
attribute itself rather than on any capability — so it would refuse a
`NOSUPERUSER` role however the shop list had been obtained.

That dependency is deliberate, and it is not the provider's. **`reconcile.py` is
an AUDITOR, and it is supposed to see what RLS hides:** a checker that could see
only one tenant's rows could not tell you that a row belonging to tenant A had
landed in tenant B, which is the one thing it exists to catch. The provider
service has the opposite requirement — enumerate shops, read no shop data — which
is why one gets a third role with a single grant and the other keeps `postgres`.
Reading this section as "the work is half finished" is the error it is written to
prevent.

### D3 — audit logging exists from the provider service's first day

Two things are recorded: **every provider read of a shop's data**, and **every
master-data write with its author.**

**Reasoning.** The provider is an outside party reading other people's money, and
retrofitting an audit log tells you nothing about what happened before it existed —
the gap is permanent and is exactly the period during which nobody was watching.
The current state makes this concrete rather than precautionary:
`SRS_MAP.md § 3. The schema gap` "There is no audit log of any kind" — re-derived
at `3babd52`, `git grep -iE "audit_log|audit_trail"` over the tracked non-markdown
tree returns **exit 1**. Nothing records who changed a price, who retired a product,
or who signed in. A master-data write leaves the new value and no author.

### D4 — the shop code resolves at a SEPARATE endpoint; the login body does not change

**Added 2026-08-10. The heading above still reads "three" deliberately — it is an
interface.** SIX citations resolve to it by name — `ROADMAP.md` ×5 and
`SRS_MAP.md` ×1, all section-only — so renaming it would break every one at once.
(§9 above also refers to it, in prose the checker does not parse as a citation;
that reference is a seventh reader and not a seventh citation, and the distinction
is the point: the checker would have caught six of the seven.) That is the sixth
mechanism in
`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md" —
damage propagates OPPOSITE to the edit, and the file you changed is the one place an
inbound break cannot appear. Appending under an unchanged heading is this file's own
convention (§13).

`POST /auth/login` keeps the three fields it has today. A second, unauthenticated
endpoint resolves an eight-character code to a `tenant_id`, **returns that identifier
and nothing else**, and refuses identically whatever the cause. It reads through
`recycle_directory` — which needs a second engine and a connection string that **do
not exist anywhere in this repository today**.

**Reasoning — the invariant protecting login is an ORDER, and a code resolution
cannot stand inside it.** `server/app/main.py:125` opens the connection from
`body.tenant_id` BEFORE the user lookup at `:126-134` runs, so RLS filters that
lookup, and the handler states the consequence in its own comment (`:121-124`): *"a
username belonging to another tenant is simply invisible here -> there is no
cross-tenant login path"*. A code resolution necessarily runs BEFORE any tenant is
known — producing the tenant is what it is for — so it sits outside that protection
**by construction, not by oversight**. Folding a code into the login body would not
relocate the protection, it would delete it, and a replacement would have to be
invented in the same change. A separate endpoint leaves the order intact and confines
what runs pre-authentication to a relation holding two columns.

**Returning the identifier and nothing else is migration 0009's own argument**, made
there about COLUMNS rather than about a response, and it carries unchanged:

> THE REASON IS A SECURITY PROPERTY, NOT TIDINESS. Every column here is readable
> through a path that runs BEFORE ANY PRINCIPAL EXISTS [...] So a `name` column would
> make every shop's trading name enumerable to anyone who can reach the lookup, and a
> `created_at` would date every shop's onboarding to the same audience. A code that
> resolves to a uuid tells an outsider nothing they did not already type at it; a code
> that resolves to a shop's name tells them who they just found.

A response body has the same audience as a column. This decision **agrees with the
schema's stated intent rather than arriving at it independently**, which is the part
worth recording: the relation was designed for this, and the endpoint is not free to
widen what it discloses.

**The keyspace arithmetic in that same migration is NOT a defence, and is recorded
here as not one because a later reader will otherwise cite it as though it were.**
Under the heading `THE ALPHABET IS 31 CHARACTERS, NOT 36`, 0009 states
`31^8 = 852,891,037,441` against `36^8 = 2,821,109,907,456` and frames it explicitly
as **a cost paid for legibility** — five confusables removed so that "no support call
ever turns on whether a character was an I or a 1". A large number is not a rate
limit. Nothing in this repository limits repeated attempts at any endpoint, so the
arithmetic bounds guessing per attempt and bounds nothing about attempts.

**The refusal shape needs its own reason and does not inherit one.** The standing
generic-refusal rule — `lessons/README.md § Lessons` "login-resolves-under-tenant.md",
extended to a third arm at `server/app/main.py:154-162` — covers login and per-tenant
identity lookups. But this project decides refusal shape PER ENDPOINT, which is the
content of `lessons/README.md § Lessons` "403-is-about-what-the-caller-may-do.md":
the same status carries a different meaning and a different sentence depending on the
call site, and wording is a function of (code, call site). So the shape here is argued
rather than inherited. **This endpoint refuses identically for an unknown code, a
malformed one, and a real code withheld for any reason — and the reason is
enumeration.** Its caller holds no credential and has not claimed to be anyone, so a
refusal that distinguishes cases is a free oracle over the shop directory: *does this
code name a real shop?*, answered for anyone who can reach it. Login's collapse
protects an account; this one protects the existence of a shop. Different asset,
separate argument, same shape by coincidence rather than by inheritance.

**NOT decided, named rather than assumed:**

- **Whether this endpoint is protected against repeated attempts.** Nothing anywhere
  in the tree addresses repeated attempts at any endpoint — see the 2026-08-10 entry
  in `PROJECT_STATUS.md`, which records that as a second-hand survey result.
  **THIS BULLET IS THE WRONG SHAPE FOR THE PROBLEM AND IS KEPT ONLY AS THIS
  ENDPOINT'S SHARE OF IT.** Appended 2026-08-10: the gap is not a property of
  `POST /auth/shop-code`, it is a property of the whole API, and a bullet sitting
  under one endpoint invites somebody to close it at that endpoint and believe it
  handled. The system-level record is
  `OPEN_ITEMS.md § Decisions open` "NOTHING ANYWHERE LIMITS REPEATED ATTEMPTS";
  read that before doing anything about this one.
- **The mechanics of the second connection**: a second engine, where its DSN comes
  from, and whether the API process holds it or a separate one does.
- **Who issues a code when a shop is onboarded.**
  `ROADMAP.md § P1.3 — What identifies a shop at login` already records this as
  undecided, and nothing here changes it.

Measured, at `8b17bc2`: `LoginRequest`'s three fields are at
`server/app/main.py:29-32` with `tenant_id: uuid.UUID` at `:30`; the tenant context
opens at `:125`; the user lookup runs at `:126-134`.

### D5 — `recycle` is the DEV database and stays dev; production does not exist yet

**Added 2026-08-10.** The database this project has been building against since the
first migration is a development database on a developer's own machine. **It will
not become production.** When P1.2's hosting choice is made, the production
database is created FRESH there: migrations applied from `0001`, no rows carried
across.

**WHAT FOLLOWS, AND IT IS THE WHOLE REASON THIS IS WRITTEN DOWN.** Everything now
in `recycle` — including the pilot shop provisioned into it on 2026-08-10, its
admin user and its shop code `R6VD7RAC` — **is discarded with that database.** A
shop code is immutable once issued, but that is a promise about a code's life
INSIDE one directory; a directory that is thrown away takes its codes with it. So
the owner's shop will be provisioned again, on production, and will get a
different code then. Nobody should print a slip from the code that exists today.

**THEREFORE THE FIRST STEP TOWARD A PAYING SHOP IS NOT CLOSED** by anything done
against `recycle`. `POST /auth/shop-code` resolving a real code there is a test of
the server under the most realistic conditions available today, and it is not a
shop that can trade. P1.3's Criterion B remains outstanding for exactly this
reason: B asks whether the route works for a real shop, and a real shop is one on
production.

**WHAT THIS DOES NOT CHANGE.** `ROADMAP.md § The decisions the ordering forced`
D10 — the pilot runs on the PRODUCTION database, with no rebuild available after
the first real bill — is unchanged and unchallenged. What is clarified is WHICH
database that sentence means: not the one running today. D10 is a constraint on
the hosting choice; D5 is the statement that the choice has not been made and that
today's database is not a candidate for it.

### D6 — account provisioning is THREE endpoints, not two

**Added 2026-08-10. Nothing here is built at `a73c264`** — see the preamble for
what a second session had already put in the working tree while this was being
written, which is route 1 and nothing else. The reader most likely to be misled is
the one who goes looking for this in the committed tree: no create-user route and
no password-change route exists there —
`archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md` "NO ENDPOINT CREATES A USER AND NONE CHANGES A PASSWORD."
records the measurement. What follows is the shape that work will take, decided in
advance so that it is not designed under time pressure at P1.5.

Three routes, in the tier vocabulary of §3.1:

1. **An admin creates a user** — `require_admin`, writing into `users` under the
   caller's own tenant context, with that user's first password set at creation.
2. **An admin sets another user's password** — `require_admin`, naming the target
   user.
3. **A user changes their own password** — `get_principal`, naming no target at
   all, because the caller IS the target.

**THE TWO PASSWORD PATHS ARE SEPARATE ROUTES, NOT ONE ROUTE BRANCHING ON WHO IS
CALLING, AND THIS IS THE PART WORTH ARGUING.** The obvious design is two endpoints:
create, and one password route that reads the principal and decides whether it is
an admin acting on somebody else or a person acting on themselves. That route would
have to get three independent things right at once from one inspection of the
caller:

- **the GUARD differs** — `require_admin` against `get_principal`;
- **the REQUEST BODY differs** — one carries a target user and the other must not
  carry one at all;
- **WHOSE SESSION DIES differs** — a password change ends the sessions of the user
  whose password moved, which on the admin path is somebody else's phone and on the
  self path is the caller's own.

**AND THE THIRD OF THOSE IS A SECOND CALL SITE NOBODY HAS COUNTED YET.** Both
password routes have to end the affected user's live sessions, and the mechanism
that does it is `users.token_version` (0005), bumped and re-read by
`get_principal` on every request. Two routes means **two bump sites**, on two
different users — the target's on route 2 and the caller's own on route 3 — and
every passage in this repository that names the trigger names it in the singular,
as "bumped on password change or deactivation". A builder reading that sentence
wires one call. Sessions surviving a password change is the whole failure the
column exists to prevent.

A branch deciding all three by inspecting the caller **can be wrong in the
permissive direction**, and that is the asymmetry: a staff token that manages to
supply a target user id is one missing `if` away from setting a colleague's
password, and the failure returns 200. Two routes make that a refusal from the
router — the same reasoning as
`lessons/README.md § Lessons` "403-is-about-what-the-caller-may-do.md", which is
that wording and behaviour are a function of (rule, call site) and a single call
site cannot carry two.

**NOT decided, named rather than assumed:**

- **Whether route 3 requires the caller's CURRENT password.** It is the usual
  defence against a borrowed unlocked handset, and it is not what the owner
  decided here; assuming it would be inventing a requirement.
- **What either password route does to the caller's own token.** Route 3 ends the
  session it is issued from, so the phone needs an answer for the next request, and
  `lessons/README.md § Lessons` "401-is-about-the-caller-not-the-bill.md" already
  says what that answer must not look like.
- **Whether an admin may set their OWN password through route 2 as well as route
  3**, which is a question about overlap and not about privilege.

### D7 — an admin may create another admin

**Deliberate**, and recorded with its reasoning because without the reasoning an
admin-creating-admins gate reads as a hole somebody left in the role check.

**Reasoning — a shop with exactly one admin has a single point of failure that is
a person.** The owner loses their handset, or forgets the password, and nobody in
that shop can sign in as an admin again. Nothing in the running system recovers
from that: there is no password-change route (D6), no reset path, and no support
tier — **the only recovery that exists today is somebody running SQL on the shop's
data**, on site or over a connection nobody has designed. `provision_shop.py` is
not the way out either: it creates a shop's FIRST admin from an installer's shell
and deliberately creates nobody else, and its second run against a shop that
already has a code refuses and writes nothing
(`archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md` "THE SECOND RUN REFUSED AND WROTE NOTHING").

**THE SENTENCE ABOVE IS NOW FALSE IN ITS GENERAL FORM AND TRUE IN A MUCH
NARROWER ONE. Appended 2026-08-10, not edited, per §13.** "There is no
password-change route (D6), no reset path" was measured at `a73c264` and stopped
being true at `cb11f6a`: both password routes exist —
`POST /users/me/password` and `POST /users/{user_id}/password`.

**WHAT ACTUALLY SURVIVES, AND IT IS SMALL:** *a shop whose ONLY admin forgets
their own password has no recovery from inside the system.* Both routes are shut
to that person and for different reasons — the reset route is `require_admin`, so
it needs a SECOND admin who does not exist, and the self route requires the
CURRENT password, which is the thing they have forgotten. Nothing else in the
system issues a credential.

**AND THE REST OF THE ORIGINAL CLAIM IS GONE, which is worth saying because it is
what the new routes bought:** a STAFF member who forgets their password is now
recoverable in one request by any admin; an admin who forgets theirs is
recoverable by any OTHER admin; and "loses their handset" was always the weaker
half, because a login is not bound to a device and that person could always sign
in elsewhere with their password.

**D7'S ARGUMENT IS UNAFFECTED AND NOW RESTS ON THE NARROW CONDITION ALONE** — and
it is stronger for it. A second admin is precisely the thing that converts the
surviving case into a one-request fix, so "a shop must be able to appoint a
second keyholder without us" is the same conclusion reached from a smaller
premise. The cost paragraph below is untouched.

**What it costs, stated rather than glossed.** Admin is the tier that voids bills
and moves prices (§3.1), so an admin who creates a second admin has handed over
every capability they hold, permanently and with no audit trail — D3's log does not
exist yet. The role is a two-value CHECK, not a permission system, so there is no
weaker admin to create instead. **That cost is accepted**: a shop that cannot
appoint a second keyholder is a shop one lost phone away from needing us, and S1's
handover is explicitly a finished product rather than a support contract
(`ROADMAP.md § What the owner has settled`).

### D8 — a first password is NOT forced to change on first use

**A DECISION, and this is the whole reason it is written down.** A later session
will look for a force-change mechanism, find none, and must not read that absence
as an oversight. There is nothing to build here; there is something already
decided not to build.

**Reasoning — the price is higher than what it buys.** Forcing the change needs a
new column on `users` to record that the password is still the issued one. That
means a migration, and D5 says the production database it would run on does not
exist yet. Worse than the column, it introduces a **THIRD ACCOUNT STATE — usable
but not yet ready** — and every endpoint written from that day on would have to
know about it: the create route sets it, `get_principal` enforces it, and every
other route decides whether it is reachable in that state. `users` already carries
two pieces of state that every authenticated request re-reads (`token_version`,
`is_active`), and a third whose only job is to refuse traffic on the first login is
the expensive way to buy a nudge.

**WHAT IT COSTS, AND IT IS NOT ARGUED AWAY.** The first password is known to TWO
people — whoever set it and the staff member using it — until the staff member
changes it. Nothing forces that to happen and nothing records whether it has.

**WHAT MAKES THAT ACCEPTABLE IS WHO THE SECOND PERSON IS.** Not a stranger, not a
support desk, not a shared installer account: the **shop owner who hired them and
is standing in front of them**, handing over a phone login the way they hand over
a key to the yard. The exposure is bounded by a relationship that already exists
outside this system, which is not true of a password mailed to somebody.

**A STAFF MEMBER MAY CHANGE THEIR OWN PASSWORD AT ANY TIME, AND THIS DECISION
DEPENDS ON IT.** It is route 3 of D6, it is available from the first sign-in, and
it needs no admin, no request and no waiting. Take it away and D8 stops being a
decision about convenience and becomes a shop where the owner permanently knows
every member of staff's password — so if route 3 is ever descoped, D8 is reopened
in the same change and not left standing.

**WHAT WOULD HAVE TO CHANGE TO REVERSE THIS**, recorded so that reversing it is
costed rather than attempted: a column on `users`, the migration that adds it, and
**every endpoint learning the third state** — which is cheapest on the day the
create route is first written and grows more expensive with every route added
after it.

### D9 — the password rule is a MINIMUM LENGTH, and nothing else

No character classes, no dictionary check, no expiry, no reuse history.

**Reasoning.** The person typing it works a scrap yard with dirty hands, on their
own phone, at a weighbridge with a truck waiting. **A composition rule does not
produce a complex password; it produces one written on paper and taped to the
scale** — readable by everyone who walks past, still there after that person
leaves, and invisible to every control this system has. A short password an
operator can actually type is the better failure.

**NOT decided, named rather than assumed: the minimum length itself is a number,
and no number was chosen here.** This project records a constant with the trial
that chose it (`PROJECT_STATUS.md § Tuned constants — trial ledger`), and a length
invented in passing by whoever writes D6's create route would be exactly the
untraceable constant that ledger exists to prevent.

**AND THIS DECISION IS ABOUT THE RULE, NOT ABOUT THE ATTACK.** A minimum length
bounds guessing per attempt and bounds nothing about the NUMBER of attempts —
which nothing in this system limits, at any endpoint. That is not a footnote to
this decision, it is a system-level gap, and it is recorded as one at
`OPEN_ITEMS.md § Decisions open` "NOTHING ANYWHERE LIMITS REPEATED ATTEMPTS".

---

## 11. A known absence, stated as true rather than as a gap

**`purchase_bills` has no author column, and this is not repairable backwards.**

The INSERT at `server/app/bills.py:448-453` writes nine columns — `id`,
`tenant_id`, `seller_id`, `doc_no`, `idempotency_key`, `total_amount`,
`device_created_at`, `server_received_at`, `vehicle_no` — and no user of any kind.
Re-derived at `3babd52`: `git grep -n "created_by" -- server/` returns **exit 1**.

**The only user recorded on a bill is `voided_by`**, written from the requesting
token when a bill is voided (`bills.py:599` names the column, `bills.py:602`
supplies it), constrained by `ck_bills_void_consistency` and by a composite FK into
the same tenant. So a bill records who **cancelled** it and never who **wrote** it.

This is stated here as an invariant-shaped fact, not as a backlog item: **every
bill already written is authorless permanently**, whatever column is added later.
A bill cannot be traced to the staff member who weighed the load and handed over
the cash, and no future change makes one existing bill traceable.
`SRS_MAP.md § 3. The schema gap` "every bill already written is authorless" records
the same measurement; `OPEN_ITEMS.md § Blocking one real paying shop` "No author on
a purchase bill" carries the open question, which is *which* user a bill should
name — a bill is created offline by one person and may be synced under another's
session, and that divergence is the actual question, not the column.

**The device's own database cannot be handed to anyone, so no party can establish
that a record ever existed.** The application declares no export, no file-sharing
capability, and no debug route by which its local store can leave the handset;
measured at `16a1938`, six independent avenues were tried and none reached it.
The consequence is not that we cannot count rows. It is that on the day a member
of staff says a bill was recorded and the server has no such bill, no one on
earth can establish whether it was ever written. The shop owner cannot. The
distributor cannot. We cannot. The member of staff cannot. A dispute about money
ends by believing one person rather than by evidence. This also means every
on-device safeguard — the strict head-of-line queue, startup recovery, a bill
that parks and waits — is unobservable from outside; we know they run because
proofs run them on a development box, not because anyone has seen them run on a
handset holding money.

**ADDED 2026-08-12 — WHAT A DEVICE PASS ESTABLISHED, AND WHAT IT DID NOT. Nothing
above is narrowed by this; the claim about a shop's handset stands exactly as
written.**

**What was established.** On an Android DEBUG build of this project — built at
`9d2eb22`, applicationId `dev.chutipon.recycle`, installed on one vivo 1938 —
the app's private storage DOES open from a development box and the local database
CAN be read out of it whole: `adb exec-out run-as dev.chutipon.recycle cat
files/SQLite/recycle.db`, byte-exact against the device's own `sha256sum`, with
`PRAGMA integrity_check` returning `ok`. So the barrier this section describes is
**a property of the ARTEFACT, not of the platform and not of the application's
design.** Android hands that power to `run-as` on a package whose manifest carries
`DEBUGGABLE`, and to nothing else. The six avenues measured at `16a1938` were
avenues through the APPLICATION — an export, a share sheet, a debug route — and
this was not one of them: it went round the application entirely, which is why it
refutes none of that measurement.

**What remains unestablished, and WHY it is not merely untested.** **NO RELEASE
BUILD OF THIS APP HAS EVER EXISTED.** A shop's artefact would be release-signed
and would carry no `DEBUGGABLE` flag, and `run-as` refuses such a package outright
— measured on this same handset, where Expo Go (a third-party release-signed app)
answered `package not debuggable`. So the question this section actually turns on
— *can anyone get a record off the phone in the shop's hands?* — **has never been
measurable, because the artefact it asks about has never been built.** That is a
stronger statement than "unproved": there is nothing yet to point the measurement
at. Until a release build exists, every reading above describes a development
artefact and no shop's device.

**THE GROUND UNDER THIS SECTION HAS MOVED TWICE, and both moves changed the
REASON rather than the conclusion.** First, an earlier pass reported that this box
has no `adb` at all; it had measured `PATH`, not the disk, and `adb` was present
in the Android SDK the whole time — a property of the search reported as a
property of the machine. Second, the read that later succeeded succeeded *only*
because the artefact was debuggable, which was not understood at the time it was
attempted. **Neither changes what this section claims about a shop's device.**
What both changed is what was believed about *why* the database could not be
reached: it was taken to be a property of the platform or of the app's design,
and it is a property of how the artefact was signed. Anyone reasoning from "we
proved it cannot be read" should read this paragraph first — that is not what was
proved, and it was twice not what was proved for different reasons.

---

## 12. Corrections owed elsewhere

Found while writing this file. **Pointers, not fixes** — every one of these lives
in a file this phase was told not to edit, and the reader should know they are
known rather than undiscovered.

- **`SRS_MAP.md § 3. The schema gap` cites `users.tenant_id` at `0001:98`. It is at
  `0001_initial_schema.py:97`** — measured twice, independently; line 98 is
  `username text NOT NULL`. Off by one, nothing rests on it, the column is exactly
  as that file describes.

- **`SRS_MAP.md § 3. The schema gap`'s own audit grep no longer returns exit 1**,
  because `SRS_MAP.md` now contains the string it searches for. The command as
  written there returns **exit 0 with one hit — its own line.** The conclusion is
  unchanged and was re-derived here (§10, D3); only the command decays. This is the
  third instance of the pattern that file itself flags in
  `SRS_MAP.md § 9. Where the two sessions disagreed` "Two greps described as returning zero do not",
  and the isolating form is the one that excludes markdown.

- **`PROJECT_STATUS.md § What is built` "three-way failure classification" is stale
  by two classes** (§7). True when written; two classes were added after it.

- **Nothing points at this file yet.**
  `START_HERE.md § 1. Reading order` "In this order." does not name
  `ARCHITECTURE.md`, so a session following the reading order will not reach it.
  That is the same shape as the finding that `START_HERE.md` itself was once
  unreachable from the repository's own entry point. Adding the pointer is a
  one-line edit to a file outside this phase's scope, and it is owed.

- **`SRS_MAP.md § 8. Stale references, recorded as stale` "Found, not fixed."**
  holds four more that this file does not duplicate. Read them there.

- **`OPEN_ITEMS.md` corrected ONE of its two "not yet applied" sentences and left
  the other**, found 2026-08-10. Its `restore_db.py` key-space item still opens
  *"0009 (committed, NOT YET APPLIED to any cluster) creates directory.shop_codes"*,
  which is false — the migration was applied to `recycle` on 2026-08-09. `8b17bc2`
  corrected that file's OTHER instance, the `reconcile.py` predicate item, and a
  dated amendment roughly forty lines below that opening line already records the
  migration as applied, unambiguously. **So the correction exists and the opening
  line was not updated to match it** — which is the reason this is worth writing
  down rather than a contradiction the file cannot resolve: a reader who reaches
  the amendment is fine, and a reader who reads the item's first sentence and
  moves on is not. Owed to a commit that edits `OPEN_ITEMS.md`; deliberately not
  fixed here.

- **`PROJECT_STATUS.md` says nothing writes to `directory.shop_codes` by any
  route — "manual, endpoint, script or migration". That became false at
  `8d395fc`**, which commits `server/scripts/provision_shop.py`: it mints a code
  and INSERTs it as `recycle_owner`. **What did NOT change with it** — the script
  has never been run against the live database, `recycle`'s copy of the relation
  still holds no rows, and P1.3's Criterion B is still outstanding, that commit
  saying so in its own message. Owed to a commit that edits `PROJECT_STATUS.md`.

- **Three files cite INTO this file by LINE NUMBER — which this file's own
  *Citations* rule forbids — and the citation had already rotted before this
  commit.** `OPEN_ITEMS.md:826`,
  `lessons/a-grant-boundary-belongs-to-a-database-not-a-role.md:24` and the
  GENERATED `lessons/all-lessons.md:1660` all cite `ARCHITECTURE.md:604-605` for
  the sentence bounding what `recycle_directory` can reach. That sentence is at
  **607-609**; 604-605 holds the `provider_users` alternative, a different
  argument entirely.
  **REPAIRED 2026-08-10, AND THE REPAIR HAD TO RE-DERIVE THE NUMBER RATHER THAN
  TAKE THIS ONE.** Both live citations now read `:609-611`. `607-609` was correct
  when measured above and was stale by the time it was acted on, because the same
  round that repaired it had already added two lines to §10's preamble — a
  position cited in one file and moved by an edit to another, which is the exact
  failure this bullet is about, recurring inside a single day.
  **Nothing in THAT commit moved it**: the first line it
  adds is 795, below the whole of it, so the rot is exactly as old as it
  was and no worse — it is reported here, not caused here. Repairing
  it means editing a lesson AND regenerating `all-lessons.md`, so it belongs with
  a lessons commit. The durable repair is the one this file already prescribes at
  the top — cite a section and a quoted handle, never a position.

---

## 13. Corrections to THIS file, appended rather than edited

**Why they are here and not applied above.** Everything counted in this document
was measured at commit `3babd52` (see *Freshness* at the top), and a dated
measurement is superseded rather than rewritten — the same rule
`PROJECT_STATUS.md` follows. Editing the original sentences would destroy the
evidence that the file was right when written and hide how fast structure
decays. Three of the four below were found by a session reading this file
against the code; **the fourth was created by the change that also records it.**
**That sentence counts the ORIGINAL four and has been appended to twice since —
there are SEVEN bullets below as of 2026-08-10.** It is left standing rather than
renumbered, because a count in a preamble is the first thing to rot and the last
thing anybody re-reads; treat the list, not this paragraph, as the authority on
its own length.

- **§2.1 and §4 say FIVE migrations, `0001` through `0005`. There are SEVEN.**
  `0006_bills_created_by.py` (2026-08-07) and `0007_users_is_active.py`
  (2026-08-07) came after the measurement. **The count of TEN business tables is
  UNCHANGED and must not be "corrected" with it** — both new migrations add
  COLUMNS to existing tables and neither creates a relation, so §4's table is
  still complete and `public` still holds those ten plus `alembic_version`.

- **§11 says `purchase_bills` has no author column, and that its grep returns
  exit 1. FALSE since `0006`.** The column is `created_by uuid`, NULLABLE, with
  `fk_bills_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES users
  (tenant_id, id)`. **The rest of §11 survives intact and is the part that
  mattered**: every bill written before that migration is authorless
  permanently, no column added later makes one existing row traceable, and the
  section says so as a fact rather than a gap. What has changed is only that the
  gap is closed GOING FORWARD. Note also that §11's grep has decayed the way
  §12 predicts for `SRS_MAP.md`'s: `git grep -n "created_by" -- server/` now
  returns many hits, this file's own text among the reasons.

- **§4's `users` row says "No `is_active`, so a session can be revoked but an
  account cannot be locked". FALSE since `0007`, and this phase is what made it
  so.** `users.is_active` is `boolean NOT NULL DEFAULT true`. An account can now
  be locked as distinct from having its sessions ended, and where that is
  enforced is the unnumbered row in §8.1 — added in the same change, because a
  file whose job is naming the enforcing layer should not gain a capability and
  a stale sentence in the same commit.

- **Nothing above records that `users` gained `token_version` in `0005`
  either.** §4's `users` row does name it, so this is not a contradiction — it
  is noted only so the next reader does not treat the row as wholly stale. The
  three columns `users` has gained since `0001` are `token_version` (0005) and
  `is_active` (0007); `full_name` was always there.

- **§10's D2 says `recycle_directory` holds "no `USAGE` on schema `public`" and
  names no database. That is TRUE of `recycle` and FALSE as a property of the
  role** — measured 2026-08-10 on the live cluster. The containment was
  established by `db/init/00_init_roles.sql:101`, which runs after
  `\connect recycle` at `:95`, so it applies to that database and no other. A role
  is cluster-wide; a schema `REVOKE` is not. In the `postgres` maintenance
  database the same role DOES hold `USAGE` on `public` — harmlessly today, because
  that schema holds zero relations and `CREATE` is `f`, which is luck about content
  and not a boundary. **D2's conclusion is unaffected**: the shop list still comes
  from a relation outside the tenant model read by a role that reaches nothing else
  *in `recycle`*. Only the scope of the sentence was wrong. Appended rather than
  edited, per this section's rule; the same sentence appears in
  `db/init/00_init_roles.sql:38-41` and in migration `0009:55-59` and is owed there
  too, which is recorded in `OPEN_ITEMS.md`. Full statement of the trap:
  `lessons/README.md § Lessons` "a-grant-boundary-belongs-to-a-database-not-a-role.md".

- **FOUR sentences in this file say D2's relation and D4's endpoint do not exist.
  ALL FOUR ARE FALSE as of 2026-08-10**, and they are one claim written four
  times, which is why they are corrected in one place rather than four. Quoted as
  the file still states them:
  - §9 — "These are decisions, not proposals, and none of them is built."
  - §10's preamble — "None of the four is built. No implementation is designed
    here."
  - §10, D2 — "The migration that creates it is committed and NOT YET APPLIED to
    any cluster, so nothing below describes a database that exists today."
  - §10, D4 — `recycle_directory` "needs a second engine and a connection string
    that do not exist anywhere in this repository today".

  **Every one of them was true when written**, which is why none is deleted: §9's
  at `3e2c996`, D2's at `fc9cd5c`, and §10's preamble and D4's at `c7bc5fe` — the
  last of those false within the same day it was written.

  **WHAT IS TRUE, PRECISELY AND NO FURTHER:**

  - **The relation is on the live database.** Migration `0009` was **APPLIED TO
    `recycle` ON 2026-08-09**. `directory.shop_codes` is present with
    `shop_codes_pkey`, `uq_shop_code` and `ck_shop_code`. It held **no rows** when
    `recycle` was last measured, on 2026-08-09, and nothing has written to it
    since — stated with its date rather than in the present tense, because this
    commit read no database and a row count is exactly the kind of number that
    moves without anyone editing a file.
  - **The endpoint is committed, and carries its own proof.**
    `POST /auth/shop-code` (`1951b19`) is `server/app/directory.py`, registered at
    `server/app/main.py:104`, unauthenticated, returning the tenant identifier and
    nothing else behind a `response_model`. Its proof is
    `server/scripts/prove_shop_code.py`, which refuses to run against the live
    database.
  - **The reader role connects from the application's own stack.** `f84b54d` added
    `DIRECTORY_DATABASE_URL` (`server/app/config.py:67`, no default, failing closed
    at import) and a SECOND engine, `directory_engine` (`server/app/db.py:50`),
    opened by the API process and disposed at `server/app/main.py:61`.
  - **The SECOND of D4's three "NOT decided" bullets is answered by that same
    commit** — "The mechanics of the second connection: a second engine, where its
    DSN comes from, and whether the API process holds it or a separate one does" is
    settled in all three of its parts, above. **The FIRST and THIRD stand**:
    nothing in the tree limits repeated attempts at any endpoint, and who issues a
    code for shop number two is still undecided.

  **AND THE SENTENCE THIS CORRECTION MUST NOT BECOME — D4 IS NOT DELIVERED.** A
  code can now be MINTED: `8d395fc` commits `server/scripts/provision_shop.py`,
  which issues one as `recycle_owner`, and that commit's own message records that
  it has never been run against `recycle`. No shop has a code, so this endpoint
  still answers 404 to every input in production.
  `ROADMAP.md § P1.3 — What identifies a shop at login` is finished by two
  criteria; A is satisfied and **B is outstanding**, which is now the entire
  meaning of "P1.3 is not done"
  (`archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md`
  "OUTSTANDING: CRITERION B, AND ONLY B."). **D1 and D3 remain wholly unbuilt.**
  So §9 and §10's preamble are false about D2 and D4 and TRUE about D1 and D3 —
  half-false, which is the kind of sentence that survives longest, because every
  reader who checks the half they came for finds it correct.

- **§3's topology picture and §3.1's unauthenticated tier stopped being complete
  when the second connection landed, and neither is redrawn here.** §3 shows three
  roles reaching PostgreSQL — `recycle_app`, `recycle_owner` and `postgres` — and
  there are now FOUR: `recycle_directory` connects from the API process on its own
  engine. §3.1's "no authentication" row reads "health, and login itself"; that
  surface is now three routes, the third being `POST /auth/shop-code`. **Neither is
  a false sentence — both are enumerations that quietly stopped being
  exhaustive**, the same failure this file already warns about at §4 for relations
  and at §8.2 for policies, arriving in the two places a reader looks FIRST to
  learn what talks to what and what can be reached without a token. Recorded
  rather than redrawn: realigning the ASCII picture produces a diff no reviewer
  can read as a correction, and that is a change to propose on its own rather than
  to slip into this one.

- **§9 says the settled decisions recorded here are "D1 through D4". There are
  NINE, D1 through D9** — it was already short by one when D5 landed, and D6
  through D9 (account provisioning, 2026-08-10) widened the gap to five.
  **The bullet above names this exact failure and this is another instance of it:**
  an enumeration that quietly stopped being exhaustive, not a false statement about
  any decision it does name. Appended rather than edited, per this section's rule.
  **§9's OTHER list is a different question and is untouched:** none of the four
  entries under *Open, and named as open* is about accounts or passwords, so
  nothing D6 through D9 settled was removed from it, and a reader must not take
  this bullet as licence to prune that list.
  **Two more sentences in §12 count the same collection and are now partial**, and
  they are named here rather than edited because §12 is itself a dated correction:
  "**D1 and D3 remain wholly unbuilt**" is a true statement that has stopped being
  the whole list — D6 through D9 are also wholly unbuilt at `a73c264` — and the
  per-number verdict beside it ("false about D2 and D4 and TRUE about D1 and D3")
  partitions a set that has since gained four members. Neither is wrong about any
  decision it names. **That is the shape this whole section keeps recording:** an
  enumeration decays by the set growing under it, not by any of its sentences
  turning false.

- **D7's reasoning said "there is no password-change route (D6), no reset path".
  TRUE at `a73c264`, FALSE from `cb11f6a`, and corrected IN PLACE at D7 rather
  than only here** — because unlike every bullet above it, this one is not a
  count that grew: it is a REASON, and a reader who believes a false reason
  decides wrongly rather than merely miscounting. The narrow condition that
  survives is stated there: *a shop whose ONLY admin forgets their own password
  has no recovery from inside the system*, because the reset route needs a second
  admin and the self route needs the password they have forgotten. D7's
  conclusion is unaffected and now rests on that smaller premise.
  **THIS BULLET AND `§10 D6`'s FIRST PARAGRAPH ARE THE SAME FILE, THE SAME
  SUBJECT, AND ONLY ONE OF THEM ROTTED**, which is the finding worth carrying out
  of it — see `CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT".

- **§6 says the client authority is `mobile/src/time/shopTime.ts`. THAT PATH NO
  LONGER EXISTS.** P1.12 (2026-08-18) moved the file, byte-identical, to
  `packages/shop-time/src/shopTime.ts`, behind the package specifier
  `@recycle/shop-time`. **Every `shopTime.ts:NN` line reference in this file still
  resolves** — `:24-27` and `:45-51` among them — because the move changed no byte
  of the file; that was the point of moving it unedited. What changed is the
  DIRECTORY and the specifier its six importers use.
  **THE INSTRUCTION IN §6 IS NOW THE WRONG ONE, AND THAT MATTERS MORE THAN THE
  PATH.** It says the desktop must **PORT** the module. It must now **IMPORT** it:
  that is the whole purpose of the package, and porting would create exactly the
  second implementation the sentence was written to prevent. The superseded
  instruction is left standing above per this section's own rule; the package's
  `src/index.ts` carries the correction at the point of use, where a desktop
  author actually arrives.
  **The paragraph inside `shopTime.ts` still says PORT too.** It was left unedited
  on purpose, for the line-reference reason above, and correcting it is queued in
  `OPEN_ITEMS.md`.

**Re-derive before resting a decision on any number in this file.** The count
that decayed fastest was the migration count, and it decayed twice in one day.

---

## 14. What this system requires of a host

**Added 2026-08-12, from a full read of the tree at `94ad325`.** Every line
number below was measured in that pass. This section is APPENDED rather than
inserted: `ARCHITECTURE.md § 11` is cited by name from other files, and a
numbered insert would renumber it and orphan those citations — the argument that
closed the A-, R- and D-numbers rather than tidying them.

**What this section is for.** The hosting step
(`ROADMAP.md § P1.2 — A server a shop can reach`) is a spend
decision with external lead time, and a choice made before the requirements are
known is one that gets discovered to be wrong after it is paid for. These are
requirements, not a recommendation: no host, product or price is named here, and
the choice remains the owner's.

### 14.1 The conclusion, and it does not stand without 14.2 and 14.4

**THIS SYSTEM NEEDS A MACHINE THE PROJECT CONTROLS — shell access, a superuser,
role creation and database creation. A service that hands over a database and
nothing else cannot run it.** The two reasons are independent, and either alone
is sufficient; both are measured below.

1. **Role creation is not optional and not deferrable** — the migration chain
   HALTS AND RAISES without a role no migration creates, and the API will not
   boot without three separate connection strings that have no defaults (14.2).
2. **Without a superuser the backup SUCCEEDS AND IS EMPTY** — a green run
   producing a schema-shaped file with no rows in it (14.4).

**Whoever later finds a cheaper arrangement will come back to this paragraph,
so the refutable form is written out.** To overturn this conclusion, show ONE
of: a way to create three roles with distinct privileges; a way to run
`server/db/init/00_init_roles.sql`, which needs `psql` meta-commands
(`00_init_roles.sql:22` — "PSQL ONLY … cannot be fed to a generic SQL executor,
a migration runner, or a driver like asyncpg"); or a dump that captures rows
under FORCE row-level security without a superuser. Anything less does not
answer it. **It is a claim about what is written today**, not a law: 14.5 names
what would have to be built to change it, and that work is queued at
`OPEN_ITEMS.md § Blocking one real paying shop` rather than hidden here.

### 14.2 Role creation — a host that forbids it cannot run this system at all

Not an inconvenience, and not a thing to work around later. Two independent
halves:

**THE MIGRATION CHAIN HALTS AND RAISES.** `0009_directory_shop_codes.py:349`
reads `pg_roles` for `recycle_directory` **before writing anything** and
`:351` raises `RuntimeError` when it is absent. `:359` states the cause in the
error text itself — "no migration creates it either". `alembic upgrade head`
therefore stops at 0009, and the migration runner wraps the run in one
transaction, so nothing lands and the database stays at 0008.

**THE API WILL NOT BOOT.** Three environment variables, each read with
`os.environ[...]` and no default, so a missing one fails at import rather than
at request time: `config.py:51` (`APP_DATABASE_URL`, the RLS-bound app role),
`config.py:67` (`DIRECTORY_DATABASE_URL`), `config.py:75` (`JWT_SECRET`, which
`:76` also rejects when empty). The first two are **two different roles, not two
spellings of one**: the directory reader holds SELECT on one relation and no
privilege on schema `public`, which is what lets a shop code be resolved before
any principal exists. A single-role host cannot satisfy that by configuration.

**What the host must permit ONCE, at first setup, and need not permit
afterwards** — all in `server/db/init/00_init_roles.sql`:

| statement | line |
|---|---|
| `CREATE ROLE recycle_owner` / `recycle_app` / `recycle_directory` | `:46`, `:55`, `:64` |
| `ALTER ROLE recycle_directory SET search_path` | `:87` |
| `CREATE DATABASE recycle OWNER recycle_owner` (via `\gexec`) | `:89` |
| `GRANT CONNECT ON DATABASE` ×2 | `:92`, `:93` |
| `ALTER SCHEMA public OWNER TO recycle_owner` | `:100` |
| `REVOKE ALL ON SCHEMA public FROM PUBLIC` | `:101` |
| `ALTER DEFAULT PRIVILEGES FOR ROLE recycle_owner` | `:106` |

Afterwards the runtime needs none of it: all three roles are created
`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, and migration 0009 grants the
directory role its two privileges (`:407`, `:408`) rather than the bootstrap
doing it.

### 14.3 Where a superuser is required, and where it deliberately is not

**The API runtime never holds one**, and that is a designed property rather than
an accident: `config.py:51` and `:67` are the only two connections it opens, and
both roles are `NOSUPERUSER NOBYPASSRLS`. What needs elevation is the tooling
around it:

| what | where | what breaks without it |
|---|---|---|
| Reconciliation's tenant listing | `reconcile.py:661` requires `current_setting('is_superuser')` to be `on`; `:626` declares the DSN | reconcile exits **2 = could-not-run**; the money checker cannot run |
| Taking the dump | `backup_db.py:564` refuses unless `rolsuper` is true | see 14.4 — the dump succeeds and is empty |
| Dumping cluster roles | `backup_db.py:595` `pg_dumpall --globals-only`; `:593` records why — it reads password hashes from `pg_authid` | no roles captured, so a disaster restore cannot rebuild them |
| Restoring | `restore_db.py:58`; `:377` `DROP DATABASE … WITH (FORCE)`; role attributes re-checked afterwards | roles come back unverified — a `recycle_app` restored with `BYPASSRLS` reads every tenant while the policies still look correct |

**One requirement here is not a database privilege at all.** `main.py:183` —
clearing a tripped clock guard needs "DATABASE CREDENTIALS AND SHELL ACCESS ON
THE HOST, not an admin account in the product. A support path that only speaks
HTTP cannot clear this guard."

### 14.4 Without a superuser the dump SUCCEEDS AND IS EMPTY

**A green backup with no data in it.** Those are the words, because every
weaker phrasing rounds this down to a permissions nuisance.

**WHY.** Every business table carries FORCE row-level security, so a
non-superuser `pg_dump` sees no rows. It then goes one of two ways, and the
second is the dangerous one: `backup_db.py:561` records that such a dump gives
"either a hard pg_dump error or, with `--enable-row-security`, an empty
backup", and `:33` spells the trap out — that flag "makes the dump SUCCEED with
whatever rows the policy admits", which for an unset tenant context is **zero
rows**. Exit 0. A file of the right shape. Nothing to see.

**THIS IS THE MOST EXPENSIVE MEMBER OF A FAMILY THIS PROJECT ALREADY
COLLECTS** — a check that fails by measuring LESS, which is indistinguishable
from a pass. It is the worst of them because the artefact is the one nobody
opens until the day the disk is dead, and by then the window it was supposed to
cover has closed. The defence is already built and must not be removed:
`backup_db.py:564` refuses to run as a non-superuser at all, and the dump is
compared table by table against live counts so a zero against a non-zero is a
hard failure.

**So a host requirement follows directly:** the backup identity must be able to
read every tenant's rows — a superuser, or a role that FORCE RLS does not bind —
and `--enable-row-security` must never be added to make an error go away.

### 14.5 The version floor is 15, and ONE column sets it

| what the code uses | where | floor | whose property |
|---|---|---|---|
| a non-volatile `DEFAULT` recorded in the catalogue, no table rewrite | `0004:21`, `0005:48`, `0007:54` | 11 | the repo states it |
| `gen_random_uuid()` in core | `0001:19` | 13 | the repo states it |
| `DROP DATABASE … WITH (FORCE)` | `restore_db.py:377` | 13 | PostgreSQL |
| **`pg_database.datlocprovider`** | **`backup_db.py:294`** | **15** | **PostgreSQL — the column does not exist on earlier majors, so the SELECT errors outright** |

**THE BINDING CONSTRAINT IS `datlocprovider`, AND THE SPLIT MATTERS: the API
runs on 13; it is the BACKUP TOOLING that requires 15.** Anyone reading "15"
as a property of the application will over-constrain the choice; anyone reading
"13" will find the backup broken, and the backup is half of P1.2's own
acceptance criterion.

**WHAT LOWERING IT WOULD COST, written here so a future decision is made with
the price visible rather than as a cleanup.** That column is read for exactly
one purpose: to be compared against `'c'` at `backup_db.py:341` and again at
`restore_db.py:368`. **That comparison is a GUARD — it refuses to back up, or
restore into, a database whose collation provider is not libc.** Removing the
column and both guards lowers the floor to 13 and trades away the only thing
standing between this system and a silently mismatched collation, on a host that
creates the database for you and chooses the provider itself. The shop code's
own CHECK constraint was reasoned against a measured collation, so this is not
hypothetical tidiness. **Lower it as a decision with this cost recorded, never
as a cleanup.**

### 14.6 What is NOT required — stated on purpose

A requirements list that lists only requirements makes every absence look
unexamined. Each of these was searched for and not found, with a control.

**NO POSTGRESQL EXTENSION, AND THE NEGATIVE IS CONTROLLED.** Measured at
`94ad325`: `git grep -i -c -E "create extension" -- server/` exits **1** with
zero hits, while the same instrument over `server/migrations/` finds
`create table` **13 times across 4 files** and exits 0 — and `server/` contains
that path, so the search that found the one reaches everywhere the other could
live. Nothing needs `pgcrypto`, `uuid-ossp`, `citext` or `btree_gist`; there is
no `EXCLUDE USING` constraint to demand one. The reason is recorded at
`0001:19` — the one function that would otherwise have required an extension is
core from 13.

**A TLS TERMINATOR IN FRONT IS SAFE, WITH ONE EXCEPTION.** The server builds no
absolute URLs: no redirect response, no `url_for`, no cookie, no trusted-host
middleware, and the only middleware in the tree is the clock guard at
`main.py:160`. Authentication is a bearer token, not a cookie, so no
`Secure`/`SameSite` behaviour changes. Client paths carry no trailing slash and
the transport strips them at `httpTransport.ts:82`, so no framework
slash-redirect is reachable.

**THE EXCEPTION, AND IT IS THE ROUTE YOU LOSE WHEN YOU MOST NEED IT.**
`main.py:186` compares `request.url.path != "/health"` as an EXACT STRING, and
`main.py:172` makes `/health` the designated way back in when the clock guard
trips. Mount the application under a path prefix without setting `root_path` and
the guard sees `/api/health`, refuses that too, and the one route designed to
stay reachable during a clock trip returns 503. **TLS termination alone does not
cause this; a PATH-REWRITING proxy does.** A host requirement follows: terminate
TLS freely, do not rewrite the path — or set `root_path` in the same change.

**CORS IS NOT NEEDED BY THE HANDSET, AND IS NEEDED BY CALLERS THAT DO NOT
EXIST.** The mobile client is not a browser origin and sends `Authorization`
rather than cookies, so no policy affects it and no preflight is issued. The
callers that would need one are both browsers and neither is built —
`ROADMAP.md § Findings this file carries because no other file records them`
"CORS is a prerequisite" argues it, and `git ls-files desktop/` returns
`desktop/.gitkeep` alone. Mixed content is the coupling that matters: an HTTPS
page cannot call a plain-HTTP API.

**NO SIZING REQUIREMENT IS RECORDED ANYWHERE.** This file fixes no CPU, memory,
disk, connection-count or uptime figure, and this pass found none elsewhere. An
absence, stated so it is not mistaken for a small number.

### 14.7 What the client requires, and what it costs to change

One string, one reader: `mobile/app.json:32` holds `apiBaseUrl`, and
`mobile/app/config.ts:24` is the only thing that reads it (`:18` throws when it
is missing). Nothing pins a certificate. **But the value is baked in at build
time**, so moving to an `https://` host costs a rebuild and a redistribution,
not a setting on the device — which is why it couples to the build step rather
than being a late edit.

**No connection string in the tree carries a TLS option.** The three DSNs in
`server/.env.example` are plain, so a host that requires TLS to Postgres needs
all three changed.

### 14.8 The checklist — what to ask a host's documentation

**WHY IT IS IN THIS SECTION rather than in a file of its own.** Every question
below points at a subsection ABOVE it. From another file each pointer would be a
cross-file citation that a renamed subsection breaks silently; from three lines
below, whoever renames one sees the questions on the same screen. It has no
content of its own — delete 14.1–14.7 and nothing here means anything — so a
separate home would be a second copy to keep in step, which is
`CLAUDE.md § Scope and status` "Do not restate any of it here" applied to a
procedure instead of a status. **The subsections are referenced by number and
heading and NOT in the
`file § Section` "handle" citation form**, because a citation whose target is its
own file counts its own line and cannot resolve —
`lessons/README.md § Lessons` "a citation whose TARGET is its own file".

**HOW TO USE IT.** Every question is yes or no, answered from the host's own
documentation. **None of them restates why the requirement exists** — read the
subsection named beside each one before deciding that a "no" is survivable.
Record the answer with the date and where it was read; an answer remembered from
a previous sitting is not an answer.

**A — DISQUALIFIERS. A "no" to ANY of these ends the evaluation, and the rest
need not be read.** They are ordered cheapest first: A1 is usually one page of a
host's documentation, and A2 is usually the next.

| # | Question | Comes from |
|---|---|---|
| **A1** | Can we create our own database roles — three of them, with attributes and privileges we choose? | *14.2 Role creation — a host that forbids it cannot run this system at all* |
| **A2** | Can we obtain a superuser connection, or a role that FORCE row-level security does not bind? | *14.4 Without a superuser the dump SUCCEEDS AND IS EMPTY*, and *14.3 Where a superuser is required, and where it deliberately is not* |
| **A3** | Can we create and drop databases on the same cluster? | *14.2*, and the restore path in *14.3* |
| **A4** | Can we run a `psql` script against the cluster — one using meta-commands, not a driver? | *14.1 The conclusion, and it does not stand without 14.2 and 14.4*, and *14.2* |
| **A5** | Do we get shell access on the machine, with the database credentials? | *14.3* |

**B — TRADES. A "no" costs something NAMED and does not end the evaluation.**
Every question is written so that **"no" is the costly answer**, so a column of
yeses is the cheap outcome and no question has to be read backwards.

| # | Question | Comes from | What a "no" costs |
|---|---|---|---|
| **B1** | Is PostgreSQL 15 or later available? | *14.5 The version floor is 15, and ONE column sets it* | exactly what 14.5 records under "WHAT LOWERING IT WOULD COST" — read it there, and take it as a decision |
| **B2** | Is the database created with the libc locale provider rather than ICU? | *14.5* | the backup and the restore both refuse to run at all until the guard named in 14.5 is removed, which is B1's trade arriving by another route |
| **B3** | Is the application reached at the path it is served on, with nothing in front rewriting it? | *14.6 What is NOT required — stated on purpose* | the fix is one setting, applied in the SAME change — 14.6 names it and names what breaks if it is not |
| **B4** | Do our connection strings work as written, with no TLS parameters required? | *14.7 What the client requires, and what it costs to change* | three strings change; 14.7 says which |

**C — NOT QUESTIONS FOR A HOST. Two gaps of OURS, and no provider can answer
them.** Writing them as criteria would let a host's answer look like a
resolution.

1. **Nothing schedules a backup. It runs when a person runs it.**
2. **The dumps land on the same disk as the database.**

Both are already recorded and are not restated here:
`OPEN_ITEMS.md § Blocking one real paying shop` "Scheduled and off-site backup",
and `server/scripts/BACKUP.md` "Deliberately not built".
**BOTH OPEN AT THE FIRST REAL BILL AND NEITHER CLOSES ON ITS OWN.** Choosing a
host does not close them, and a host that offers its own backups does not close
them either — an unverified copy nobody has restored is the thing
`lessons/README.md § Lessons` "a-backup-is-a-claim-until-it-is-restored.md" is
about. They are P1.2's to close, and P1.2's DONE WHEN already asks for the
scheduled dump and the off-box restore.

**D — THE ONE PEOPLE FORGET WHEN COMPARING HOSTS, and it belongs at the end
because it is not a question about the database at all.**

**HOW A HOST GIVES ACCESS TO THE MACHINE DECIDES WHAT TOOLING MUST BE WRITTEN,
not merely configured.** The backup and restore scripts reach the database by
shelling into a container and carry no DSN path at all, so the access model is
not a comfort question — it sets the SIZE of the work that follows the move. The
work is already counted at
`OPEN_ITEMS.md § Blocking one real paying shop` "THE BACKUP TOOLING CANNOT REACH A REMOTE DATABASE AT ALL"
and is not restated here. **Ask it while comparing, not after choosing:** two
hosts that answer A1–A5 identically can still differ by that whole item.
