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
| `tenants` | one row per shop; the unit a licence would attach to | `(id, name, created_at)` and nothing else — no address, no phone. **No endpoint reads it** |
| `users` | authentication, not an employee master | `tenant_id NOT NULL`; `role` CHECK 2 values; `token_version` (0005). No `is_active`, so a session can be revoked but an account cannot be locked |
| `uoms` | units of measure (kg, crate, piece) | `(code, name)` + `is_active` |
| `product_categories` | paper, steel, copper … | `(code, name)` + `is_active` |
| `products` | what a yard buys | composite FKs to category and uom + `is_active`. **No sell price, no stock column** |
| `product_prices` | the CURRENT buy list, per product per grade | `UNIQUE (tenant_id, product_id, grade)`, grade CHECK `A`–`D`. Historical bills never read back from here |
| `sellers` | who sells to the yard | grade selects the price tier; `id_number`/`address`/`vehicle_no` added by 0004 (SRS 1.6) + `is_active` |
| `purchase_bills` | the bill header — one load, one bill | client-supplied `id` (no default), nullable `doc_no`, `idempotency_key`, two timestamps, three void columns |
| `purchase_bill_items` | the money lines | three weights, both prices, stored `amount`, `line_no` |
| `doc_no_counters` | the gap-free document sequence | `PRIMARY KEY (tenant_id, be_year)`, one row per shop per Buddhist year (0002) |

**Why the shape is this shape**, in three points that are not obvious from the
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
from the caller's token except at `server/app/main.py:64`, where no token exists
yet and the tenant comes from the request body as a submitted identity claim. RLS
then guarantees the lookup can only see that tenant's users, so there is no
cross-tenant login. It is the one place the rule "the tenant comes from the token"
does not apply, and it is deliberate.

---

## 9. What is LOCKED, and what is open

**LOCKED** — carried from `CLAUDE.md § Architecture`, which is where the list
lives and where any change to it must be made. Do not propose alternatives; do
help defend them.

- The three programs and their stacks (§2.1).
- One API as the only writer; no client touches the database; no client
  implements a business rule.
- The eight hard rules, `CLAUDE.md § Hard rules`.

**Settled but recorded here rather than in `CLAUDE.md`** — §10, D1 through D3.
These are decisions, not proposals, and none of them is built.

**Open, and named as open** (each is somebody's decision, none is designed here):

- **What a provider service enumerates tenants FROM** — §10, D2.
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
**None of the three is built. No implementation is designed here.**

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

**AND AN OPEN QUESTION THIS DECISION DOES NOT ANSWER: what the provider service
enumerates tenants FROM.** The constraint as stated is satisfiable while the
problem remains, so it is recorded rather than treated as closed.

The `tenants` policy is keyed on the table's own `id`. So under `recycle_app`: with
the GUC set, `SELECT id FROM tenants` returns exactly one row, its own; with the
GUC unset, it returns none. **The application role cannot produce the list that a
per-tenant loop needs in order to start.**

`reconcile.py` resolves this by not using the application role for that step.
`list_tenants` at `reconcile.py:663-668` runs `SELECT id FROM tenants` on a
separate `admin` connection, and `reconcile.py:627` **refuses to run unless that
role is a superuser**. A superuser bypasses RLS by virtue of being a superuser —
a strictly stronger privilege than `BYPASSRLS`. **So D2's letter is satisfied while
the only working cross-tenant reader in the system still depends on `postgres`.**

The candidates visible from the current code, none designed and none chosen:

- **an owner or superuser connection**, as `reconcile.py` does today — honest about
  what it is, and the largest privilege in the system;
- **the `provider_users` table from D1 carrying the mapping itself** — the provider
  service would then read only shops it has a row for, and would never enumerate
  `tenants`;
- **a dedicated relation outside the tenant model** holding the shop list, the way
  `alembic_version` sits outside it today.

Which of these is right is the owner's, and it wants deciding before the provider
service is built rather than after.

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

---

## 13. Corrections to THIS file, appended rather than edited

**Why they are here and not applied above.** Everything counted in this document
was measured at commit `3babd52` (see *Freshness* at the top), and a dated
measurement is superseded rather than rewritten — the same rule
`PROJECT_STATUS.md` follows. Editing the original sentences would destroy the
evidence that the file was right when written and hide how fast structure
decays. Three of the four below were found by a session reading this file
against the code; **the fourth was created by the change that also records it.**

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

**Re-derive before resting a decision on any number in this file.** The count
that decayed fastest was the migration count, and it decayed twice in one day.
