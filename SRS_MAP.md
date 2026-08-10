# SRS map

**What this file is.** A line-by-line map from the requirements document at
`docs/SRS.md` to what exists in this repository, and — separately — to what has
been PROVEN to exist. It records where things stand. **It decides nothing:** no
ordering, no recommendation, no design. Order lives in `ROADMAP.md`, the queue in
`OPEN_ITEMS.md`, observed status in `PROJECT_STATUS.md`.

**THIS IS A MEASUREMENT, TAKEN 2026-08-07 AT COMMIT `ddf3c85`, AND IT DECAYS.**
Every count below came from a command run against that tree on that day. Read it
the way `PROJECT_STATUS.md § Baseline observations` says to read a dated green:
**re-derive it, do not cite it.** A number here that is three phases old is a
claim about a repository that no longer exists, and the map will not know it has
gone stale — nothing recomputes it. If you need one of these numbers, run the
command in its row again.

**Two sessions produced it, and they disagreed.** A read-only survey was run
first, against this same commit, in a chat window; its result existed in no file.
A second session — this one — **re-derived every one of its claims with its own
commands before any of it was written down**, and did not transcribe a single
number. The two agreed on the substance almost everywhere and **disagreed in
seven places**. The disagreements are recorded in this file rather than smoothed,
because a disagreement between two independent readings is worth more than either
reading alone. They are marked ⚠ inline and collected under *Where the two
sessions disagreed*.

**One claim was withdrawn entirely rather than recorded.** The survey attributed
a figure of "roughly 25-30% of the SRS" to `ROADMAP.md`. `git grep -n "25-30"`
returns **exit 1** — the string is in no tracked file, `ROADMAP.md` included, and
`git log --all -S "25-30"` finds no commit that ever removed it. It came from a
draft pasted into a chat window. It is **not recorded here, and its absence is
not recorded as a stale reference either**, because it was never a fact about
this repository. This is `OPEN_ITEMS.md § Documentation` "The bill-attribution
claim" exactly: three files once agreed on a sentence none of them had read out
of the code.

**Evidence standard.** `BRIEFING.md § 3` "Built and proven, versus built and
unverified": **Proven** = the real path ran and was OBSERVED (an HTTP request and
its response, rows read back out of Postgres, a screen seen on a handset), and
the observation is dated. **Built** = the code exists and the types check, which
is not evidence of anything. **"The code exists" is not evidence** and never
appears in the Evidence column below on its own.

**The SRS is now in the repository** at `docs/SRS.md`, verbatim as the owner
holds it, added by the same task that wrote this file. Before that it was
unreadable from here and no claim about it could be re-derived by anyone.
`PROJECT_STATUS.md § SRS references` remains true about the SRS 1.6 transcription
it carries and about the owner being the authority: **if `docs/SRS.md` disagrees
with the owner, the owner is right.**

---

## 1. The map, item by item

19 items: the 17 numbered headings (1.1–1.9, 2.1–2.3, 3.1–3.3, 4.1–4.2) plus the
two UI/UX paragraphs. Counted from the file, not assumed —
`verify_srs.py` asserts `HEADINGS=17/17` and both `Color Scheme:` paragraphs, with
a negative control.

**Status vocabulary.** **BUILT** = the requirement is served end to end and that
has been observed. **PARTIAL** = some of it runs. **NONE** = nothing serves it and
nothing has decided not to. **DELIBERATELY-NOT** = named on the out-of-MVP list in
`PROJECT_STATUS.md § What is NOT built`, which reads: *sell flow, stock, other
income/expense, checkbox permissions, employee master, buyers, profile images, QR
codes, scale integration, Excel export, reports.*

| SRS | Status | Where it lives | Evidence (Built-vs-Proven) | SRS assigns to | Actually on |
|---|---|---|---|---|---|
| **1.1** UOM | PARTIAL | `uoms` (migration 0001); 5 endpoints `GET/POST/PATCH /uoms`, `+/deactivate`, `+/activate` | **Proven** over HTTP by `prove_master_write.py` (exit 0 twice bare, 2026-07-28). **No screen anywhere** — unproven because unbuilt | Desktop | server only |
| **1.2** Product Categories | PARTIAL | `product_categories` (0001); 5 endpoints | Same as 1.1 | Desktop | server only |
| **1.3** Products | PARTIAL | `products` (0001) = `id, tenant_id, category_id, uom_id, code, name, is_active`; `product_prices` grade `CHECK (grade = ANY (ARRAY['A','B','C','D']))` | Buy prices **proven** by `prove_seller_pricing.py`. **`ราคาขาย@` (sell price) has no column** and **`สต๊อกคงเหลือ` (stock) has no column or code** — `git grep -riE "stock\|inventory"` over `server/app/ server/migrations/ mobile/src/ mobile/app/` = **0** | Desktop | server only |
| **1.4** Employees | DELIBERATELY-NOT | nothing | "employee master" is on the out-of-MVP list. `git grep -riE "employee"` over the four source trees = **1 hit**, a word in `0005`'s docstring. `users` is authentication, not an employee master: no address, no phone, no notes | Desktop | nowhere |
| **1.5** Buyers | DELIBERATELY-NOT | nothing | "buyers" is on the list. `git grep -riE "buyer"` = **0** | Desktop | nowhere |
| **1.6** Sellers | PARTIAL | `sellers` = `id, tenant_id, code, name, phone, grade, is_active, id_number, address, vehicle_no` (0001 + 0004) | **All seven SRS fields exist**, read out of `information_schema` on the live DB. Writes **proven** over HTTP (`prove_master_write.py`). The *Feature* line — profile image upload, QR/barcode — is DELIBERATELY-NOT ("profile images", "QR codes"): `git grep -riE "qr.?code\|barcode"` = **0**. No screen | Desktop | server only |
| **1.7** Expense Categories | DELIBERATELY-NOT | nothing | "other income/expense". `git grep -riE "expense"` = **0** | Desktop | nowhere |
| **1.8** Other Income Categories | DELIBERATELY-NOT | nothing | "other income/expense" | Desktop | nowhere |
| **1.9** Company Profile | ⚠ **NONE** | `tenants` = `(id, name, created_at)` only | **One of three SRS fields exists** (`name`); no address, no phone. And **nothing reads it**: `git grep "FROM tenants" server/app/` → **exit 1**. So the shop name cannot reach a report header or a slip because no endpoint returns it and neither artifact exists | Desktop | a column nothing reads |
| **2.1** Daily Buy | PARTIAL | **Mobile:** `App.tsx`, `app/CartScreen.tsx`, `Numpad.tsx`, `SellerPicker.tsx`, `ConfirmSaveDialog.tsx`; `src/cart/`, `src/sync/`. **Server:** `POST /bills`, `GET /bills`, `GET /bills/{id}`, `POST /bills/{id}/void`. **Desktop: nothing** | Mobile flow **proven** headless (`prove:cart`, `prove:entry`, `prove:seller`, `prove:sync`) and **on real handsets** — bills `B-2569-222/223/224/225` read out of `purchase_bills` on 2026-07-29 across two devices. NOT built: QR member scan and scale auto-read (both DELIBERATELY-NOT). **The whole Desktop half is absent** — no bill form, no data grid, no edit/delete, no F8/F9 slip | Desktop **and** Mobile | mobile + server; desktop nothing |
| **2.2** Daily Sell | DELIBERATELY-NOT | nothing | "sell flow" and "stock". `git grep -riE "sell_\|sale"` over the source trees = **2 hits, both the word "wholesale" in comments** | Desktop + Mobile | nowhere |
| **2.3** Other income / expense records | DELIBERATELY-NOT | nothing | "other income/expense" | Desktop + Mobile | nowhere |
| **3.1** Master Data Reports | DELIBERATELY-NOT | nothing | "reports" and "Excel export". `GET /uoms`, `/products`, `/sellers` etc. return lists, but no report and no print path exists. `git grep -riE "excel\|xlsx"` = **0** | Desktop | nowhere |
| **3.2** Transaction Reports | DELIBERATELY-NOT | nothing | "reports", "Excel export"; its sell half additionally depends on 2.2. No filter/grouping/sheet-splitting code of any kind | Desktop | nowhere |
| **3.3** Financial & Inventory Reports | PARTIAL | `GET /reports/daily` (`server/app/reports.py`), `app/DailyScreen.tsx`, `src/reports/dailyView.ts` | **Proven** by `prove_daily_report.py` (63 checks, green twice, 2026-07-29) and on a handset twice (2026-08-02 admin; 2026-08-06 staff 403). **What it covers is one column of one table in this item**: the day's purchase spend, plus voids and off-list payments the SRS never asked for. **Absent:** sell revenue, other income, other expense, the net difference, and the entire Inventory/Stock report | Desktop, Mobile read-only | mobile + server, partial |
| **4.1** User Management | ⚠ PARTIAL | `users` = `id, tenant_id, username, full_name, role, password_hash, created_at, token_version`; `POST /users/{id}/revoke-sessions` | The table and the role gate are **proven** (`prove_auth.py`, `prove_revocation.py`, X1 both directions). **No management of any kind exists:** no add, no edit, no delete, no password change — `users.py` holds exactly **one** route and its own docstring calls itself a STOPGAP. The only credentials that exist come from `seed_dev.py`. Checkbox permissions are DELIBERATELY-NOT; what exists is a 2-value `CHECK (role IN ('admin','staff'))` | Desktop | server only, minimal |
| **4.2** Mobile Authentication | PARTIAL | `POST /auth/login` (argon2 + HS256 JWT); `App.tsx` sign-in button | Server half **proven** (`prove_auth.py`; login observed 200 on a handset repeatedly). **The client has no credential entry at all** — `git grep -nE "TextInput" mobile/App.tsx` returns **nothing**, and `signIn()` reads hardcoded `DEMO` constants at `app/config.ts:34-38`. QR Code Login is DELIBERATELY-NOT | Mobile | server proven; client is a demo button |
| **UI/UX — Desktop** (blue/white, circular icons, tabbed, MDI) | **NONE** | nothing | `ls -la desktop/` → one file, `.gitkeep`, **0 bytes**; `git ls-files desktop/` → `desktop/.gitkeep`. There is no application to have a colour scheme | Desktop | nowhere |
| **UI/UX — Mobile** (blue gradient, 3D buttons with shadow and depth, large, large weight font) | PARTIAL | `mobile/app/*.tsx` | **Large targets and large fonts are real and measured:** `TAP_MIN = 56` (above both platform minimums), largest fonts 44pt. **The rest is not built:** `git grep -icE "gradient\|shadow\|elevation"` over `mobile/app/` + `App.tsx` returns **one hit, and it is a code comment about variable shadowing** — no gradient, no 3D treatment anywhere. Root background is flat `#f8fafc`. And the SRS asks for the largest font **at the weight**: the two 44pt values are MONEY (`DailyScreen.amount`, `ConfirmSaveDialog.total`); the weight readout is `Numpad.fieldValue` at **32** | Mobile | mobile, partial |

---

## 2. The counts, and what they do not mean

| status | count |
|---|---|
| **BUILT** | **0** |
| PARTIAL | 9 |
| NONE | 2 |
| DELIBERATELY-NOT | 8 |
| **total** | **19** |

**NOTHING HERE IS WEIGHTED, so this is a count of headings and not a count of
work.** SRS 1.1 (a two-field lookup table) and SRS 2.1 (the entire purchase flow
across two platforms) are one row each. Any fraction taken from this table —
"n of 19", a percentage — **overstates progress**, because the built items are
disproportionately the small ones and the DELIBERATELY-NOT items are among the
largest in the document. Do not compute one. The survey that preceded this map
had a percentage figure attached to it in conversation, and that figure is the
one withdrawn in the header.

**BUILT = 0 is the number that carries information.** Not one of the nineteen
requirements is served end to end and observed. The nearest is 1.6, where every
SRS field exists and is proven writable over HTTP — and there is still no screen
in either client that can set them, so a shop cannot enter a seller. This is not
a criticism of the work: it is the direct consequence of `desktop/` being empty
and of the mobile app being deliberately read-only for master data. It is stated
here so that "10 of 19 partial" is never read as "halfway".

**A distortion this table carries, named rather than hidden.** SRS 2.1 is one row
with **two halves whose statuses are opposite** — the Mobile half is
substantially built and device-proven, the Desktop half is entirely absent. It is
counted once, so the table reports PARTIAL and loses that. The same is true of
2.3 and 3.3 to a lesser degree. Splitting 2.1 would make the denominator 20 and
break comparison with the survey; it is left at 19 with the distortion recorded.

---

## 3. The schema gap

Read out of `information_schema` and `pg_class` on the live database
(`recycle_pg`, healthy on `5544->5432`), not from the migration files alone.

**What exists: 10 business tables**, created by 5 migrations (`0001`–`0005`,
chained, `alembic_version` = `0005`): `tenants`, `users`, `uoms`,
`product_categories`, `products`, `product_prices`, `sellers`, `purchase_bills`,
`purchase_bill_items`, `doc_no_counters`.

⚠ **`public` holds ELEVEN tables. The eleventh is `alembic_version`**, Alembic's
own bookkeeping. It is named here because "exactly 10 tables" is the kind of
claim a later session re-derives with `count(*)`, gets 11, and mistrusts the
whole file over.

**Tables the SRS requires that do not exist at all:** employees (1.4), buyers
(1.5), expense categories (1.7), other-income categories (1.8), sell
transactions and their lines (2.2), other-income and other-expense records
(2.3), stock/inventory (1.3, 3.3). Seven of these eight are DELIBERATELY-NOT;
stock is named on the out-of-MVP list too.

**Columns that would have to be added to tables that DO exist:**

- `products` — a sell price. `product_prices` is buy-side only (`grade` A–D);
  the SRS's `ราคาขาย@` has no column.
- `products` — stock on hand, if it is ever stored rather than derived.
- `tenants` — address and phone (SRS 1.9). The table is `(id, name, created_at)`.
- `purchase_bills` — **an author.** `grep -rn "created_by" server/` → **exit 1**,
  and the INSERT at `bills.py:450-453` writes nine columns, none of them a user.
  The only user on a bill is `voided_by`, set from the requesting token at
  `bills.py:602` (the SQL naming the column is at `:599`), constrained by
  `ck_bills_void_consistency` and a composite FK into the same tenant. **This is
  not repairable backwards** — every bill already written is authorless
  permanently. Tracked in `OPEN_ITEMS.md`; recorded here because it is a schema
  fact the SRS never asked for and never forbade.
- `users` — `is_active`. Migration 0004 added it to sellers, products, uoms and
  product_categories only, so a revocation ends sessions without locking an
  account. `users.py`'s own docstring says so.

**There is no audit log of any kind.** `git grep -iE "audit_log|audit_trail"` →
**exit 1**. Nothing records who changed a price, who retired a product, or who
signed in.

**What a provider web application would need on top, and why none of it is
reachable from here.** The system is built so that a principal is a member of
exactly one shop, at four independent layers — this is a property to be aware of,
not a defect, and no design for changing it appears in this file:

- `users.tenant_id` is `uuid NOT NULL REFERENCES tenants (id)` (`0001:98`). There
  is no user who belongs to no shop, or to all of them.
- `users.role` is `text NOT NULL CHECK (role IN ('admin','staff'))` (`0001:100`),
  and `auth.py:75` calls them "The only two roles there are." There is no
  provider role to grant.
- ⚠ **RLS is ENABLE + FORCE with one `tenant_isolation` policy on all 10 business
  tables**, `USING (<key> = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`
  — keyed on `tenant_id` everywhere except `tenants`, keyed on its own `id`. Read
  from `pg_class`/`pg_policy` on the running database, not from the migration.
  **The GUC holds one uuid and never a list**, so no single query spans two
  shops. It does NOT follow that a cross-tenant read requires escaping the
  policy: the GUC is set by the application role itself, so anything executing
  SQL as that role can set it to another shop's id and read that shop's rows,
  one tenant at a time. MEASURED on the live cluster — one `recycle_app`
  connection returned 376 bills for tenant A and 9 for tenant B, changing only
  `app.tenant_id`. `alembic_version` is the exception:
  `relrowsecurity = f`, `relforcerowsecurity = f`, **no policy** — visible in the
  catalog rather than assumed, and it holds a version string and no business data.
- All THREE DB roles are `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS` —
  `recycle_owner`, `recycle_app` and `recycle_directory`, declared in
  `00_init_roles.sql` **and read back from `pg_roles` on the live cluster**,
  all four flags `f` for each. None can escape the policy BY ROLE — and none
  needs to in order to read another shop, because the tenant the policy
  compares against is a value the application role supplies (see above).
- `get_principal` takes the tenant from the token and applies it as
  `set_config('app.tenant_id', :t, true)` — SET LOCAL, transaction-scoped
  (`db.py:89`). ⚠ Of the 34 `tenant_connection(` call sites in `server/app/`,
  every one passes the principal's tenant **except the one in `main.py`'s
  `login` handler** — the `tenant_connection(body.tenant_id)` call, named rather
  than given a line number because line numbers rot — the login
  path, where no token exists yet and the tenant comes from the request body —
  by design, per `lessons/login-resolves-under-tenant.md`.
- **No endpoint reads even the shop name.** `git grep "FROM tenants" server/app/`
  → exit 1.

**The one cross-tenant reader that exists is `reconcile.py`** — a per-tenant GUC
loop inside one REPEATABLE READ snapshot (asserted in both directions at
`:919-922`), plus a superuser connection for exactly two things (listing tenants,
counting rows globally) and a third lens with no context that must see nothing.
⚠ `prove_reconcile.py` also opens a superuser connection (`--admin-dsn`,
defaulting to `postgres@…`) but refuses to point at the live database
(`:222`), so it is a second superuser client and not a second reader of real data.

---

## 4. SRS-versus-built contradictions — recorded, NOT resolved

Each of these is a place where the requirements document and the built system
say different things. **None is settled here.** Several are settled elsewhere and
the pointer is given; the rest are open and are the owner's.

1. **SRS 2.1 asks for edit and delete on a bill; hard rule 5 forbids both.**
   "ฟังก์ชันแก้ไข/ลบ/พิมพ์สลิป (F8/F9)". `CLAUDE.md` hard rule 5: no hard deletes
   on transactions — a wrong bill is voided and reissued. The system implements
   void (`POST /bills/{id}/void`, `voided_at/by/reason`) and there is **no delete
   route anywhere** (proven: 405). The architecture is deliberate and locked; the
   SRS wording predates it. Whether "แก้ไข" is satisfied by void-and-reissue is
   the owner's call and is not made here.
2. **SRS 2.1 assigns bill creation to Desktop AND Mobile; only Mobile exists.**
   The SRS describes the Desktop as the cashier's bill-entry surface with Mobile
   feeding it ("Submit to Desktop"). The built system has Mobile submitting to a
   **server**, and no Desktop at all. This is `CLAUDE.md`'s locked architecture —
   both clients are clients of the same API — and it is a genuine difference from
   the document, recorded as one.
3. **The out-of-MVP list says "reports"; a report is built and device-proven.**
   `GET /reports/daily` plus `DailyScreen.tsx` serve part of SRS 3.3. The list in
   `PROJECT_STATUS.md § What is NOT built` still reads "reports". Both are true
   statements about different scopes; the list has not been narrowed to say so.
4. **SRS 1.3 requires stock computed automatically from buy/sell; neither side
   exists.** Stock cannot be meaningful while only the buy side is recorded —
   which `ROADMAP.md` already states as a dependency. Recorded here as an SRS
   requirement with no schema behind it.
5. **SRS 4.1 requires checkbox permissions; the system has a 2-value role.** A
   `CHECK (role IN ('admin','staff'))` cannot express "this user may open the
   takings but not retire a product". Checkbox permissions are DELIBERATELY-NOT,
   so this is a known divergence rather than an oversight — but the SRS's own
   examples (ข้อมูลพนักงาน, ข้อมูลสินค้า, บันทึกการรับซื้อ, รายงานสรุปการเงิน) are
   finer-grained than two roles can represent.
6. **SRS 4.2 requires a Username/Password login page; the app has neither field.**
   `mobile/App.tsx` contains no `TextInput` at all; `signIn()` posts the hardcoded
   `DEMO` credentials from `app/config.ts:34-38`. The server accepts real
   credentials and hashes with argon2 — the gap is entirely on the client.
7. **SRS 1.6 makes seller grade the price selector, and it is; but a grade-less
   seller is refused a default rather than given one.** That is
   `lessons/fallback-default-is-a-wrong-number.md` and is deliberate. Noted
   because the SRS does not describe the grade as optional and the column is
   nullable.
8. **SRS 3.2 requires Excel export splitting sheets by product category.** No
   export of any kind exists (`git grep -riE "excel|xlsx"` = 0), and Excel export
   is DELIBERATELY-NOT.

---

## 5. Built without a requirement

Split, because the two halves mean different things.

### 5a. Infrastructure the SRS would never have named

A requirements document describes what a shop sees. None of the following is in
`docs/SRS.md`, and none of it is scope creep — it is what makes a multi-tenant
money system survive contact with a yard. Listed so that a future reader comparing
the SRS to the codebase does not read it as unrequested work:

- **Tenant isolation.** RLS ENABLE + FORCE with one policy per business table,
  two NOBYPASSRLS roles, tenant context as SET LOCAL per request. **This is the
  most strongly proven property in the system** — see §6.
- **Offline-first sync.** `src/sync/`: local-first writes, per-record
  pending/synced/failed, a strict head-of-line queue, three-way failure
  classification, backoff, startup recovery, queue-health alarms, clock-sanity
  checks on stored instants.
- **Idempotency.** `idempotency_key` on every bill create with
  `UNIQUE (tenant_id, idempotency_key)`; a repeated key returns the existing bill.
- **Server-assigned document numbers.** `doc_no_counters` keyed on
  `(tenant_id, be_year)`, taken under a row lock, derived from the transaction's
  own clock — hard rule 3, and the two-clock defect fixed in its own commit.
- **Void instead of delete**, with three columns that must move together.
- **Money as NUMERIC end to end.** 8 NUMERIC columns; **0** `real`/`double
  precision` columns in `public`, read from `information_schema`.
- **Both prices on every line** (`unit_price` and `list_price`), so a historical
  bill is never recomputed from a current list.
- **Two timestamps per bill** (`device_created_at`, `server_received_at`).
- **Reconciliation.** `reconcile.py`: 17 per-tenant checks + 10 global, three
  lenses, no fixtures, writes nothing.
- **Backup and restore**, with a round trip proven and a disaster-recovery
  rehearsal on a throwaway cluster.
- **Session revocation.** `users.token_version` (0005), minted into every token
  and re-read per request.
- **27 proof scripts** — 13 server (`server/scripts/prove_*.py`), 14 mobile
  (`prove:*` in `mobile/package.json`) — counted, not read off a document.

### 5b. Scope that arrived without a requirement behind it

Smaller, and a different question: these serve no SRS line and are not
infrastructure. Each is defensible; none is traceable to the document.

- **Off-list payment surfacing** (`unit_price <> list_price`, per bill and per
  line, plus `off_list_variance`). The SRS asks for a daily financial summary; it
  does not ask for this. It is fraud surveillance, and it shaped the schema.
- **`voids_applied` — the second void question.** Voids performed today against
  bills from earlier days, flagged `from_earlier_day`. Not in the SRS.
- **The permanent understatement caveat** on the daily screen, unconditional and
  in informational blue.
- **Master-data retirement** (`is_active` on four tables) with `activate` as well
  as `deactivate`. The SRS has no retirement concept; `activate` was explicitly
  not asked for even internally.
- **`sellers.vehicle_no` AND `purchase_bills.vehicle_no`** — the seller's usual
  vehicle and the truck that turned up. The SRS names one vehicle field (1.6).
- **The 12-hour price-default cutoff.** A cached-price gate that refuses to
  default a price onto a bill. No requirement; it exists because a stale cached
  price is shaped exactly like a staff override.

---

## 6. Security posture, per area

**Findings only.** What is proven, by which instrument; then what is absent that
a system handling other people's money would normally have. No recommendation and
no ordering — that is `ROADMAP.md`'s, and several of these already have a step
there.

### Proven

| area | what is established | by what |
|---|---|---|
| **Tenant isolation** | The strongest-proven property in the system. `prove_rls.py` connects **as `recycle_app`** (its own docstring, `:3`) and asserts at `:213` that the role is not superuser and not bypassrls. `reconcile.py` checks from three lenses, with **X2** asserting the per-tenant row counts SUM to the global count — without which every check could pass over rows RLS hid from every context | `prove_rls.py`, `reconcile.py`, `prove_reconcile.py` |
| **RLS actually bites** | With RLS switched off on `purchase_bills`, the checker reported **44,697 violations across 10 check ids** (`B1, B2, S3, X2, T1, T4, T10, T16, T8, T9`). The arithmetic re-added here from the recorded per-id counts and it sums exactly | `prove_reconcile.py`, **2026-08-02** |
| **Password handling** | argon2 via `PasswordHasher`, dispatched off the event loop; a precomputed `DUMMY_HASH` verified against when no user is found, so a missing user and a wrong password cost the same — no timing oracle, no user enumeration | `security.py`, `prove_auth.py` |
| **Role gate** | `admin` required for void, every master-data write and the daily report; resolved from the `users` row under tenant context on every request, so a demotion takes effect at once. Proven both directions (X1), and the 403 has been drawn on a handset | `prove_auth.py`, `prove_master_write.py`, device pass 2026-08-06 |
| **Session revocation** | A token issued before a `revoke-sessions` bump is refused at its next request; a token carrying no version claim is refused rather than read as zero. The guard line was removed and the proof observed RED before it was restored | `prove_revocation.py`, device pass 2026-08-07 12:08 |
| **Fail-closed config** | `JWT_SECRET` has no default and an empty value is refused at import — a default value would be a default identity | `config.py:50-56`, `lessons/config-defaults-must-fail-closed.md` |

⚠ **The 44,697 figure must not be quoted without its instrument's state.**
`prove_reconcile.py` **has been RED since 2026-08-03** and has not been green
since. Three of its expectations are absolute counts of a 46-tenant database the
rebuild destroyed (`:634` `{"T0": 91}`, `:636`
`rows_visible_with_no_tenant_context=46`, `:718` `rows_at_start=46 rows_at_end=47`).
**Every injection that is about MONEY still passes**; what decayed is the proof's
expectations about its own fixture, not the checker's ability to see a money
defect — measured either side of migration 0005, so `token_version` is not
involved. Both halves of that are true and both belong to the number.

### Absent

Stated as findings, with no judgement about whether each should exist:

- **No transport security.** `mobile/app.json:30` is
  `"apiBaseUrl": "http://192.168.1.238:8000"` — plain HTTP. A grep for
  `https|tls|ssl` across `server/app/`, `server/migrations/`, `mobile/app.json`
  and `mobile/src/adapters/` returns **exit 1, zero**. On a LAN this is a choice;
  the moment the API is reachable from outside it, the bearer token, the login
  credentials and every money value are on the wire in clear. `ROADMAP.md` R3
  already carries HTTPS as a requirement of that step.
- ⚠ **No rate limiting, no lockout, no failed-login record.** No throttling,
  backoff or attempt counter guards `POST /auth/login`, and nothing records a
  failed attempt anywhere. *(On re-running this: the grep
  `rate.?limit|slowapi|throttle|lockout|failed_login` is **not** empty — it
  returns 6 hits for `lodash.throttle` in `mobile/package-lock.json`, a
  transitive Expo dependency, plus one comment in `app/api.ts`. **A non-empty
  result is not a refutation.** The command that isolates the answer is
  `git grep -inE "rate.?limit|slowapi|throttle|lockout|failed_login" -- server/ mobile/src/ mobile/app/`.)*
- **No account lock.** `users` has no `is_active` column, so `revoke-sessions`
  ends live sessions and the user can sign in again the same second. Right for a
  handover, wrong for a dismissal; the endpoint says so itself.
- **No user management at all.** One route under `/users/*`. No creation, no
  password change, no deletion. The only credentials that exist come from
  `seed_dev.py`.
- **No author on a bill, and no audit log.** See §3. A bill cannot be traced to
  the person who weighed the load and handed over the cash.
- **No CORS policy** — because there is **no middleware of any kind**.
  `git grep -in "CORS"` → exit 1, and `main.py` registers nothing. Harmless while
  the only clients are native; it becomes a decision the moment a browser is one.
- **JWT is one symmetric HS256 key with no key id, no issuer and no audience.**
  The payload is exactly `sub, tenant_id, username, role, token_version, iat, exp`
  — seven claims, read out of `security.py`. There is no key rotation path: one
  secret, one algorithm, nothing in a token that says which key signed it.
- **`JWT_TTL_SECONDS = 3600`** at `config.py:59`, env-overridable, no refresh
  token. `PROJECT_STATUS.md`'s trial ledger records it at **trial 1, "unrecorded —
  chosen without a written reason"**, with **two other decisions resting on it**:
  `tokenStore.ts` justifies persisting the token at all with "a stolen token is
  worthless within the hour", and the sign-out exposure was bounded by it. Change
  it for an unrelated reason and both arguments move with nobody revisiting them.
- **A known one-request window in `get_principal`**, measured and accepted rather
  than missed: the principal resolves in its own transaction and the handler opens
  a second, so a revocation committing between them lets exactly one in-flight
  request through. It fails closed on the next request. Documented at
  `auth.py:96-119`; recorded here because it is a real property, not because it is
  unaddressed.
- **Dev credentials in the tree.** `00_init_roles.sql` carries
  `owner_pw_dev`/`app_pw_dev` and `app/config.ts` carries a working password.
  Both are labelled DEV-ONLY. They become real the moment either is reused.

---

## 7. The three undocumented decisions, as gaps

Each is a decision nobody has recorded anywhere in this repository, stated as a
gap with what already exists that it could be built on. **No design for any of
them appears here** — that is out of scope for this file by instruction.

### 7a. How a licence is enforced — nothing exists

`CLAUDE.md`'s second line says this is "Sold as a monthly-license SaaS to
multiple shops (multi-tenant)". **No code implements any part of that.** Searched
for `licen[cs]e`, `subscription`, `hardware.?id`, `machine.?id`, `activation`,
`lapse`, `renew`, `trial`, `billing`, `payment`, `invoice`:

⚠ *(Run over all tracked non-markdown files this returns ~40 KB dominated by
~650 `"license": "MIT"` lines in `mobile/package-lock.json`. **That is npm
metadata, not a finding, and a non-empty result is not a refutation.** The
command that isolates the answer excludes lockfiles:*
`git grep -rniE "licen[cs]e|subscription|hardware.?id|machine.?id|activation|lapse|renew|trial|billing|payment|invoice" -- ':!*.md' ':!*package-lock.json'`*.)*

With lockfiles excluded, per term: `licence/license` **0**, `subscription` **0**,
`hardware.?id` **0**, `machine.?id` **0**, `trial` **0**, `billing` **0**,
`invoice` **0**. The only hits are `activation` (3, all *de*activation of master
data), `lapse` (33, all `elapsed`/`collapse` in backoff code), `renew` (1, a
token), `payment` (11, a seller being paid cash). **There is no licensing,
subscription, activation, expiry or billing code in this system.**

*What exists to build on:* `tenants` as the unit a licence would attach to;
`token_version` as a per-user session lever; RLS as the boundary a lapsed licence
would have to act outside of. *What is unresolved and is the owner's:* what a
lapsed licence does to a shop that has already bought a load today — the one
question none of the above answers.

### 7b. The provider has no seat

Not a missing feature: a property of four layers at once, set out in §3. Every
principal belongs to exactly one shop, the GUC holds one uuid, all three DB roles
are NOBYPASSRLS, and no endpoint reads `tenants`. **There is currently no way for the
vendor to be a user of this system**, which is why `reconcile.py` runs as a
script with a superuser DSN rather than as an endpoint. *What exists to build
on:* `reconcile.py` is a working, proven cross-tenant reader, and it is the only
one. *What has since been decided, and is recorded in
`ARCHITECTURE.md § 10. The three settled decisions`:* the provider gets a separate
seat rather than a third tier on the existing roles (D1); cross-tenant reads stay a
per-tenant loop with no `BYPASSRLS` role (D2); and the shop list that loop iterates
comes from a dedicated relation outside the tenant model, whose migration is
committed and **APPLIED TO THE LIVE DATABASE `recycle` ON 2026-08-09** — this read
**"NOT YET APPLIED to any cluster"** until 2026-08-10, when the cluster was measured
and the relation was found on four databases. This was the FIFTH file carrying that
sentence; `8b17bc2` corrected three in `ROADMAP.md` and `server/README.md` was the
fourth. *What is still unbuilt:* all of
it — no provider seat, service or endpoint exists, and the sentence above about
there being no way in remains true of the running system.
**The survey believed an earlier `ROADMAP.md` had recorded a decision
here. It has not:** `git log --all -S "separate service"` and
`-S "share a token"` each return **no commit**, and **no markdown file has ever
been deleted from this repository** (`git log --all --diff-filter=D -- '*.md'` →
empty). Whatever was decided, it survives nowhere here.

### 7c. Printing — nothing exists, and it may not be a late item

`git grep -iE "esc.?pos|thermal|printer|58mm|80mm"` returns **15 hits, every one
of them prose**: markdown, lesson files, and two comments. **No implementation.**
The SRS requires slip printing (2.1, F8/F9) and puts the company profile on slip
headers (1.9); `CLAUDE.md` assigns thermal ESC/POS 58/80mm to `desktop/`, which
holds one 0-byte file.

*What exists to build on, and it is a real constraint rather than a note:*
`mobile/src/time/shopTime.ts:45-51` carries a **NEXT CONSUMER** block naming the
desktop thermal slip and requiring the module be **PORTED — "offset constant,
brand, and the ordering rule" — not re-derived**: "a second `+ 543` somewhere in
Electron is a second behaviour, and the two would drift at exactly the boundary
neither author tested." `ROADMAP.md` R7 carries the same constraint in the same
words. This is the only one of the three gaps that already has a written
engineering constraint attached to it, and it is load-bearing:
`lessons/be-year-comes-after-the-timezone.md` exists because that exact
derivation has already been got wrong twice.

*What is unresolved:* whether the pilot shop needs a printed slip on day one.
`ROADMAP.md` records that this question inverts its own A/B split and cannot be
settled from the code.

---

## 8. Stale references, recorded as stale

**Found, not fixed. Fixing them is a different phase** — they are listed so they
are not re-discovered as mysteries, and so nobody trusts them in the meantime.

- ⚠ **The lesson count disagrees in four places, and `PROJECT_STATUS.md`
  disagrees with ITSELF.** Measured today: `lessons/` holds **35 lesson files**
  (37 `.md` files, less `README.md` and the generated `all-lessons.md`) and
  `lessons/README.md` carries **35 index lines** — and the two correspond exactly,
  with **0 files unindexed and 0 index lines pointing at a missing file**. Against
  that: `PROJECT_STATUS.md:183` says **34**, `PROJECT_STATUS.md:1371` says **34**,
  `PROJECT_STATUS.md:2040` says **35** ("the 35th lesson"), and `BRIEFING.md:145`
  says **32**. `PROJECT_STATUS.md § Known stale references` already records the
  BRIEFING drift; what it does not record is that the file contradicts itself two
  sections apart. `BRIEFING.md` is the worst-placed of the four — it is the
  handoff for a reader who will not open the codebase, so it is the one file whose
  counts its own reader cannot check.
- **`START_HERE.md:23` says `PROJECT_STATUS.md` is "1940 lines". `wc -l` says
  2053** — 113 lines stale. It matters beyond arithmetic: `PROJECT_STATUS.md:20`
  sets its own split-review trigger at **"Revisit at 2000 lines"**, so the file is
  **53 lines past a threshold written into its own text**, while the pointer a new
  session reads first still reports it as under. Both numbers are left as they
  are; neither is this file's to change.
- **`mobile/app.json:29`'s own comment names the wrong reader.** It says
  "`device/src/config.ts` is the single reader" of `apiBaseUrl`. The reader is
  **`mobile/app/config.ts:24`**; `git grep -n "apiBaseUrl"` finds no
  `device/src/config.ts` anywhere. Comment only, no behaviour depends on it —
  and it sits on the one string `ROADMAP.md` R3 says will be swapped for a cloud
  URL, which is when someone will follow it.
- **`mobile/src/device/expoSqliteDriver.ts:14` cites `tsconfig.device.json`,
  which does not exist.** Already recorded in `PROJECT_STATUS.md § Known stale
  references` and in `OPEN_ITEMS.md`; repeated here only because a map of what is
  where should not silently omit a pointer that leads nowhere.

---

## 9. Where the two sessions disagreed

Seven, in the order they appear above. The first is the reason this section
exists at all.

1. **The withdrawn "25-30% of the SRS".** The survey attributed it to
   `ROADMAP.md`. The string is in no tracked file and no commit ever held it.
   Withdrawn entirely rather than recorded as stale — see the header.
2. **"Exactly 10 tables"** — 10 business tables, **11 in `public`**;
   `alembic_version` is the eleventh (§3).
3. **"RLS on every table"** — on all 10 business tables; **`alembic_version` has
   it off with no policy**, read from the catalog rather than assumed (§3).
4. **The lesson count** — the survey had the directory, `PROJECT_STATUS.md` and
   `BRIEFING.md` disagreeing. They do, **and `PROJECT_STATUS.md` also contradicts
   itself**: 34 at `:183` and `:1371`, 35 at `:2040` (§8).
5. **The 44,697 RLS-off measurement** — real, and its instrument
   (`prove_reconcile.py`) **has been RED since 2026-08-03**, with three fixture
   counts expired and the money injections still passing. Both halves recorded
   (§6).
6. **Two greps described as returning zero do not** — the licensing grep (§7a)
   and the rate-limiting grep (§6). Both **conclusions** hold; both **commands**
   return lockfile noise, and a later session re-running them must not read a
   non-empty result as a refutation. The isolating command is given at each site.
7. **Four line-number and scope corrections**, carried into the text above:
   `auth.py:75` (not `:77`) is where "The only two roles there are" is written;
   `bills.py:599` is the SQL naming `voided_by` and `:602` is where the token
   supplies it; `main.py:64` is the by-design exception to "the tenant comes from
   the token and nowhere else"; and `prove_reconcile.py` is a second superuser
   client, though not a second reader of live data.

**And one place the two sessions agreed that this file records anyway**, because
it is the more useful half of the survey's contribution: **BUILT = 0**. Both
readings, taken independently, put every one of the nineteen requirements at
partial, absent, or deliberately excluded. Neither found a single one served end
to end.
