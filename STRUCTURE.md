# Structure

**What this file is.** The structural design of 2026-09-03, produced by a
read-only design session at commit `b25d7b0` and written here verbatim, so that
the twelve sections of decisions below exist in the repository and in the
advisor's paste set rather than in one session's window. Every measurement in it
is pinned to `b25d7b0`; re-derive before resting a decision on a number.

**Approved in full by the owner, 2026-09-03: "เอาหมด".** That approval is of the
DESIGN. Sections beyond unit 1 are design and not authorisation: each unit in
section 12, and each batch in section 11, is authorised individually by the owner
as it is briefed, and nothing here is built by being written down.

**How this file is read.** It is referenced by name in prose from `ROADMAP.md`'s
reconciled-blueprint section and it is in the paste set (`tools/build_paste_set.py`);
it is NOT in the citation checker's source list, so a `file § heading` handle
pointing into it is not machine-checked. Supersede in place, dated, when a section
is overtaken; never delete.

---

## 0. The baseline this design is pinned to

Everything below is measured at `b25d7b0` unless labelled otherwise.

| what | value | instrument |
|---|---|---|
| tree | clean, HEAD `b25d7b0` | `git status --porcelain` empty, `git rev-parse --short HEAD` |
| both typecheck programs | exit 0 and exit 0 | `npm run typecheck` then `npm run typecheck:app`, each bare, output to a scratch file |
| database | PostgreSQL 16.14, `recycle_pg (healthy)` on `5544->5432`, Alembic head `0017` | `docker ps`, `SELECT version()`, `SELECT version_num FROM alembic_version` |
| relations at head | 17 base tables: 16 in `public` plus `directory.shop_codes` | `information_schema.tables`, read from the database, not the migration log |
| user-defined triggers | 8, all `audit_capture` | `SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal` |
| `tenants` columns at head | `id, name, created_at, default_grade, seller_code_target_holding, address, phone, staff_money_visible` | `information_schema.columns` |
| `Depends(require_admin)` sites | 29: `master.py` 20, `users.py` 7, `bills.py` 1, `reports.py` 1 | `grep -c 'Depends(require_admin)' server/app/*.py` |
| inline role reads | 2 gates: `master.py:1119`, `reports.py:948`; plus the gate itself `auth.py:343` and a display read `main.py:422` | `grep -n 'principal\.role' server/app/*.py` |
| Thai literal lines, non-proof | 658 in `mobile/src/*.ts` outside `src/proof`; 1033 when `mobile/app/*.tsx` (323) and `App.tsx` (52) are added | `grep -cP '[\x{0E00}-\x{0E7F}]'` per file, summed |
| Thai literal lines, proof | 686 in `mobile/src/proof` | same instrument |
| `OutboxKind` members / handler members / `LocalStore` methods | 3 / 14 / 29 | `outbox.ts:81`, the interface at `outbox.ts:246-349`, `types.ts:614-885` |
| payment, licence, LINE, upload structures | none in `server/app` or migrations | word-anchored greps; control `unit_price` hit 4 files |

Two of the brief's figures differ from mine. The brief says 28 `require_admin` sites; I count 29, which agrees with the 2026-09-02 note in `ARCHITECTURE.md § 3.1`. The brief says 616 non-proof and 635 proof Thai lines; my definitions give 658 and 686. The difference is definitional or a day of drift, and nothing in the design turns on either number.

One measured fact overturns a premise in the brief. `mobile/src/money/format.ts` already inserts thousands separators at render time, by string surgery over the server's decimal string, with no `Intl` and no `Number`, and `proveMoney` M5 proves `stripSeparators(display(x)) === x`. So `ARCHITECTURE.md § 5` "no thousands separators" is stale, and the collision in section 8 is already resolved in the tree in the only way hard rule 1 permits.

The principle everything below is built on is the owner's, in his words: "เราก็แค่ทำให้มัน อิสระ". The structural reading of it, which the grade model already proves at migration 0015, is this: **every shop runs the same state machine; a switch decides which transitions the server performs automatically and which a person performs from a screen.** A one-tier shop still has a tier and the server seats every seller in it. A cash-only shop still has a payment row and the server writes it at bill creation. The schema is the union. A switch hides a control. It never hides a table, and it never changes what a write means.

---

## 1. The configuration spine

**What exists.** Three per-tenant values already live as typed columns on `tenants`: `seller_code_target_holding` (0012, `integer NOT NULL DEFAULT 20 CHECK >= 1`), `default_grade` (0010, nullable, now a composite FK into `grade_tiers`), and `staff_money_visible` (0014, `boolean NOT NULL DEFAULT false`). Each is read inside the request transaction with a bare `SELECT ... FROM tenants` under RLS (`bills.py:367`, `reports.py:944`, `master.py:1116`), written by `PATCH /shop` under `require_admin`, and audited by the 0017 trigger because `tenants` is in `_AUDITED_TABLES` (`0017_audit_log.py:927`). The grade model is the fourth per-tenant value and it is a table, not a column, because it is relational. That is S16, built.

**The current shape handles storage. Change nothing there.** What is missing is not a place to keep a flag but three rules: which values are switches at all, what a switch does when it is turned off, and how the phone reads one offline.

### 1.1 Two species of switch, and only two

- **Derived switches.** A capability whose configuration is a set of rows is "on" when the set has more than one member, or any member, and the control is hidden otherwise. Nothing is stored. `grade_tiers` is the built precedent: F2 hides the grade control for a one-tier shop, and `shopSettings.ts` computes `showGrade` from the tier list. Containers, branches, payment methods a counter accepts, tier-based pricing, and seller-type lists are all this species.
- **Declared policies.** A value that cannot be derived from data because it is a choice about behaviour: whether the weigher is also the cashier, whether a bill may leave the counter unpaid, the void window in minutes, the approval threshold, the rounding rule, the retention period. Each is one typed column with its own CHECK, NOT NULL where a state must exist, nullable only where "not decided" is a real state (0010's `default_grade` argument).

A switch that could be either is derived. A derived switch cannot disagree with the data it summarises, which is the whole reason to prefer it.

### 1.2 Where a declared policy lives

Columns on `tenants` for shop-wide policies, and columns on `branches` for counter-operational policies, once section 9 lands. The line between them is a single question: is this a fact about the business or about a counter? Grades, legal retention, seller-field requirements, money visibility, and the reservation target are the business's. Cashier separation, shifts, accepted payment methods, rounding, approval thresholds, and the printer are the counter's. A one-branch shop has one row in each table, and the read is one row from each.

No `tenant_features` key/bool table, and this is where I depart from blueprint 9.2 on S16's own argument. A key/bool row cannot carry a threshold or a duration, so half the switches would not fit it; and a key validated by a code-side list is a constraint the database cannot see, which is the JSON bag's defect in a stricter costume. Every policy is a column with a type.

The declaration discipline, so that a switch cannot be added privately, is one server module, call it `policy.py`, holding a frozen dataclass `ShopPolicy` whose fields are the policy columns, read by one function inside the request transaction, and a comment beside each field naming four things: the column, the automation it selects, the client control it hides, and the proof cell that stages it both ways. `reconcile.py` gains one check that every non-identity column on `tenants` and `branches` is named in that dataclass, the S6 set-equality shape, so a column added by migration without a declaration is a red.

### 1.3 What a switch does when turned off

This is the question the brief calls decisive, and the answer is a rule, not a case list.

**A policy never appears on a write path's acceptance test.** The server accepts or refuses a bill, a payment, a seller against master-data rows, never against a switch. A bill written while containers were on references a `containers` row; that row still exists when the switch is off, so the bill is accepted, and if the container has since been deactivated the bill parks as 424 `resolvable`, exactly as a retired product does today (`bills.py:408-415`). Data written while a switch was on is therefore never invalidated by turning it off, and no offline device is ever stranded by a policy change made at the counter while the truck was on the weighbridge.

**A policy selects who performs a transition.** With `separate_cashier` off, `POST /bills` writes the payment row itself. With it on, the cashier writes it later from a screen. Both shops have the row. Turning the switch off with unpaid bills outstanding leaves them unpaid; they are real debts to sellers and a person settles them. Turning it on leaves every past bill paid, because its payment row already exists. The switch is a display rule because the state machine is the same on both sides of it.

**What breaks it.** Any line of the shape `if not policy.x: raise` on `POST /bills`, `POST /payments`, or `POST /sellers`. That line turns a display rule into a state machine and reintroduces the class of failure `lessons/unavailable-is-not-rejected.md` records: a terminal refusal of cash already paid. The reconcile-style proof for it is a grep with a positive control, run at every boundary, over every write handler for a read of `ShopPolicy` inside a refusal branch.

### 1.4 How the phone reads a policy offline

`GET /shop` is online-only today and the settings screen refuses to draw offline (`shopSettings.ts`, "ONLINE ONLY, AND NO INVENTED VALUE"). That is right for editing and wrong for the cart, which must know offline whether to offer a container picker.

Add one STRICT one-row table on the device, `cached_shop_policy(only_row, ...one TEXT/INTEGER column per policy..., fetched_at)`, refreshed by the same `refreshMaster` pass that refreshes products, sellers and tiers, in one transaction with its timestamp (the delete-all-refresh rule in `lessons/cached-master-data-is-a-price-claim.md`). Two reading rules, and they run in opposite directions on purpose:

- A policy that only hides or shows a control is read from the cache at any age. Showing a control the shop turned off an hour ago costs one server refusal the screen words; hiding a control the shop turned on costs a walk-in the yard cannot serve. So this half fails open, the same argument `deviceRole.ts` makes for the role claim.
- A policy that supplies a VALUE the yard pays against, a container's tare weight, a rounding step, a moisture default, is a price claim and is subject to the 12-hour freshness rule already applied to prices. Past it the value is shown beside an empty box and is not defaulted.

### 1.5 Change and audit

`PATCH /shop` already writes `tenants` under an admin gate, refuses unknown keys, and returns the re-read row. It widens to the new columns, and gains a sibling `PATCH /branches/{id}` in section 9. The 0017 trigger records every change with before and after and the actor; `branches` joins `_AUDITED_TABLES` in the migration that creates it, and S6 refuses a table on that list that has lost its trigger. Nothing new is needed for audit, which is the strongest thing that can be said about a mechanism.

### 1.6 The switch inventory, mapped

| blueprint item | species | home | what the server automates when it is off |
|---|---|---|---|
| separate cashier (3.1) | declared `boolean NOT NULL DEFAULT false` | `branches.separate_cashier` | writes one cash payment and one allocation at bill create |
| accepted payment methods (3.3) | derived from `branch_payment_methods` rows | table | nothing; cash is the one row every branch is born with |
| credit / unpaid allowed (3.3) | declared `boolean NOT NULL DEFAULT false` | `branches.allow_unpaid` | n/a, a display rule on the counter |
| shifts (3.5) | declared `boolean NOT NULL DEFAULT false` | `branches.shifts_enabled` | opens and closes an implicit day shift at the day close |
| cashier limit (3.5), approval threshold (6.4) | declared `NUMERIC(14,2)` nullable | `roles.payment_limit`, `branches.approval_threshold` | null means never |
| grades (5) | derived, built | `grade_tiers` | seats every seller in the one tier |
| containers (4.4) | derived | `containers` | tare typed by hand, as today |
| moisture (4.5) | declared `boolean` on branch plus per-product default pct | `branches.moisture_enabled`, `products.default_deduction_pct` | pct is 0 |
| per-piece and lump (4.6) | derived from `products.pricing_basis` | column on the product | basis is weight, as today |
| photo per bill (4.7), face per seller (S12) | declared `boolean NOT NULL DEFAULT false` each | `tenants.require_bill_photo`, `tenants.require_seller_face` | nothing required; the file row may still be attached |
| ID required (5.1) | declared, one boolean per field | `tenants.require_seller_id_number`, `..._id_photo`, `..._address` | nothing required; compliance report shows the gap |
| void window (4.12) | declared `integer` minutes nullable | `tenants.void_window_minutes` | null means admin-only void at any time, as today |
| rounding (4.9) | declared `text CHECK` | `branches.rounding_rule` | `none` |
| language (10.1) | per user, not per shop | `users.locale` | th |
| retention (13.11) | declared `integer` days nullable | `tenants.personal_data_retention_days` | null means undecided; the purge refuses to run |
| branches (9.3) | derived from `branches` count | table | one branch, hidden |
| LINE OA (11) | derived from `tenant_line_channels` row | table | central OA |

What proves the spine: for every declared policy, one proof stages the transition both ways against the real route, and one cell creates data under ON, flips OFF, and reads it back unchanged with the day's report unchanged. A policy that lacks that pair is a switch nobody has watched turn.

---

## 2. Money in and out

**What exists.** A bill is the whole of money today: `purchase_bills(total_amount)` plus lines with `amount`, both server-computed and CHECKed non-negative, `ck_items_net`, `ck_bills_void_consistency`, `uq_bills_tenant_idem`. No row anywhere says money left the drawer. The word `payment` occurs in `server/app` twice, both in `reports.py` prose. Every bill is implicitly paid in full, in cash, at creation, by whoever created it.

### 2.1 Payment as a ledger, not a status

The relationship between a bill and money leaving the shop is many-to-many with an amount on the link, and I hold that against the simpler one-payment-per-bill shape for three reasons that come from the yard, not from tidiness. A regular seller brings three loads in a morning and takes one bundle of cash. A large load is paid a deposit now and the rest when the metal is sold on. A shop advances money to a supplier who is going out to collect, before any bill exists. The first is one payment across several bills, the second several payments across one bill, the third a payment with no bill at all. Only allocations hold all three.

| table | columns | keys and rules |
|---|---|---|
| `payments` | `id uuid PRIMARY KEY` (client-minted, no default, hard rule 3's shape because a counter can be offline), `tenant_id`, `branch_id`, `seller_id`, `method text CHECK IN ('cash','promptpay','transfer','write_off')`, `amount NUMERIC(14,2) NOT NULL CHECK > 0`, `idempotency_key text NOT NULL`, `reference text` (transfer ref, slip id), `device_created_at timestamptz NOT NULL`, `server_received_at timestamptz NOT NULL`, `paid_by uuid NOT NULL` (principal), `shift_id uuid` nullable, `recorded_by_migration boolean NOT NULL DEFAULT false`, `voided_at/voided_by/void_reason` | `UNIQUE (tenant_id, id)`, `UNIQUE (tenant_id, idempotency_key)`, composite FKs to `sellers`, `users`, `branches`, `shifts`; `ck_payments_void_consistency` identical in shape to the bill's |
| `payment_allocations` | `tenant_id`, `payment_id`, `bill_id`, `amount NUMERIC(14,2) NOT NULL CHECK > 0`, `created_at` | `PRIMARY KEY (tenant_id, payment_id, bill_id)`, composite FKs to both parents; append-only at the grant level, no UPDATE and no DELETE for `recycle_app` |

**Superseded 2026-09-12 (measured against `db=recycle` at head `0021`): the printed `payments` row above is the DESIGN, and on three columns it is NOT the shipped schema — a future migration that trusts it will collide with what shipped.** `paid_by` shipped at migration 0020 as `uuid` **NULLABLE** under `ck_payments_paid_by CHECK (paid_by IS NOT NULL OR recorded_by_migration)`, not `NOT NULL`: 71 pre-0006 dev bills reconstruct a payment with no payer, and inventing one would be a wrong number beside real money (0020's departure 2). A migration that trusts the printed `NOT NULL` would add a constraint the shipped CHECK already contradicts. `shift_id` was OMITTED by 0020 and SHIPPED by migration 0021 (this unit), so the printed nullable `shift_id` is accurate from 0021 on. `verification_status` (§2.4) is still design-only. The design intent is unchanged; only the claim that these are live is corrected.

The bill carries **no payment status column**. Paid amount is the sum of allocations from live payments; status is unpaid, partial, or paid by comparison with `total_amount`; a seller's balance is live bills minus live payments, and the sign says whether the shop owes the seller or holds an advance. A stored status is a second copy of a derivable fact and it is the thing this codebase exists to refuse. The cashier queue is the bills whose live allocations sum to less than their total, an anti-join that is fine at a shop's daily volume and is recorded under the same future-volume note as the two seq-scans already filed.

A payment is voided, never deleted. Its allocations carry no void of their own; a query treats allocations of a voided payment as void, so the pair moves together without a second consistency CHECK. A wrong allocation is corrected by voiding the payment and reissuing. Voiding a bill that has been paid leaves the payment standing, the seller then holds an advance equal to the paid amount, and the reissued bill is allocated from it. Nothing is edited, which is hard rule 5 read across two tables.

The invariants, each one a reconcile check with named row output:

- P1: for every payment, sum of its allocations is at most `amount`.
- P2: for every bill, sum of live allocations is at most `total_amount`.
- P3: every allocation's payment and bill share `tenant_id` and `seller_id` (the composite FKs carry tenant; seller equality is the checker's).
- P4: no allocation references a voided bill from a live payment created after the void.

### 2.2 The degenerate case, which is every shop today

With `separate_cashier` off, `POST /bills` writes, in its one transaction, one `payments` row (`method = 'cash'`, `amount = total_amount`, `paid_by = created_by`, `server_received_at` the same instant the bill takes) and one allocation. The shop never sees either. A cash-only shop is therefore the case of one payment per bill, and it was never a special case in the schema.

On the dev database, which D5 says is discarded, the migration backfills one such pair per live bill with `recorded_by_migration = true`, so a reader can tell a reconstruction from a record. On production, which does not exist yet, the table is born with the model and the column is always false.

### 2.3 The bill line, rewritten once

Three blueprint decisions rewrite `purchase_bill_items`, and D10 says they land in one migration before the first real row. They are per-piece pricing (4.6), containers (4.4) and moisture (4.5), and rounding (4.9) which reaches the header.

| column | change |
|---|---|
| `pricing_basis text NOT NULL DEFAULT 'weight' CHECK IN ('weight','count','lump')` | new |
| `quantity NUMERIC(14,3) NOT NULL` | new; the number the price multiplies |
| `container_id uuid` nullable, `container_count integer` | new, composite FK to `containers(tenant_id, id)` |
| `deduction_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK BETWEEN 0 AND 100` | new; moisture or impurity |
| `payable_weight NUMERIC(14,3) NOT NULL` | new; `net_weight` after deduction |
| `item_ref text` nullable | new; the per-line serial P1.1 may require, see section 5 |
| `gross_weight`, `tare_weight`, `net_weight`, `unit_price`, `list_price`, `amount` | unchanged |

The arithmetic stays one formula so the reconciler keeps one duplicate: `amount = round(quantity * unit_price, 2)`. The CHECKs pin quantity to the basis: weight means `quantity = payable_weight`; lump means `quantity = 1` and `unit_price` is the lump; count means quantity is pieces and `payable_weight` may be zero. `ck_items_net` stays exactly as it is, because gross minus tare is a physical fact; `payable_weight = round(net_weight * (1 - deduction_pct/100), 3)` is a second CHECK. Backfill: `quantity = net_weight`, `payable_weight = net_weight`, `deduction_pct = 0`. The header gains `rounding_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0` with the invariant `total_amount = sum(line amount) + rounding_adjustment`, bounded by the branch's rounding step. `reconcile.py` T1 and T2 learn both, duplicating the arithmetic and importing nothing, which is the line `a-checker-must-not-share-the-code-it-checks` draws.

`containers(id, tenant_id, code, name, tare_weight NUMERIC(14,3), is_active)` is master data in the shape of `uoms`: composite unique on `(tenant_id, code)`, retired never deleted, audited. `products` gains `pricing_basis` (the default for a line) and `default_deduction_pct`.

### 2.4 PromptPay, slips, the drawer, shifts, expenses, approvals

**PromptPay QR** is a payload format over a payee identifier and an amount. It is not a business rule and it is not a table. It lives in `packages/` as a pure function with CRC, proven over known vectors, and both the phone and the desktop render it; the payee identifier is `seller_bank_accounts.promptpay_id`. The payment row records `method = 'promptpay'` and the reference the cashier reads back off the banking app.

**Slip verification** is a server call to an external verifier, because the server holds the credential. The payment row gains `verification_status text CHECK IN ('unverified','verified','mismatch','failed')`, `verified_at`, `verifier_ref`. The verifier credential is one typed row in `tenant_slip_verifiers(tenant_id, provider, credential_ciphertext, key_id, created_at)`, encrypted with a server key, absent meaning the capability is off. Verification never blocks recording the payment; a `mismatch` is a flag the owner is notified of, section 7.

**Shifts** subsume P1.19. `shifts(id, tenant_id, branch_id, opened_at, opened_by, opening_float NUMERIC(14,2), closed_at, closed_by, counted_cash NUMERIC(14,2), expected_cash NUMERIC(14,2), variance NUMERIC(14,2), variance_reason text, created_at)` with a CHECK that the four close columns are all null or all present, the void-consistency shape. `expected_cash` is computed by the server at close from the float, cash payments, and cash movements inside the shift, and then frozen on the row, hard rule 6 applied to a drawer. A shop without shifts closes its day exactly as P1.19 describes, and the server materialises one shift spanning the day at the moment of the count; that is the automation the switch selects. P1.19's DONE WHEN, including its required zero case, is met by this table and nothing else is needed for it.

**The drawer** is a derived number: float plus cash in, minus cash payments and expenses, over the open shift. No table.

**Cash movements** `cash_movements(id, tenant_id, branch_id, shift_id, kind text CHECK IN ('expense','float_in','float_out','deposit_to_bank'), amount, note, receipt_file_id, created_by, device_created_at, server_received_at, idempotency_key, void columns)`, the same immutability and idempotency as payments.

**Approvals** `approvals(id, tenant_id, subject_kind text CHECK, subject_id uuid, reason text CHECK IN ('over_limit','below_list','void_paid'), requested_by, requested_at, status CHECK IN ('pending','approved','refused'), decided_by, decided_at)`. An approval gates a transition a role's limit would refuse; the threshold columns live on `roles` and `branches`. It is a state on a subject, not a column on the subject, so a bill never carries an approval column.

### 2.5 A payment reaching the server from an offline counter

Every one of these tables is written offline first, so each is an outbox kind. Measured cost of a kind today is roughly 1,900 non-proof lines and 67 constructor sites reddened, from the 2026-09-02 review and from `outboxHandlers.ts:535-541`. **Superseded 2026-09-12 — re-measured against HEAD: 76 constructor sites (`new SyncEngine(`), by the repo grep over `*.ts` (75, every one in `mobile/src/proof/`) and over `*.tsx` (1, `mobile/App.tsx`). The SPLIT changes what the cost IS: 75 are proof files and exactly ONE is production, so the trap a reader weighs is a single production constructor site, not 76 — a reader who thinks all 76 are production weighs the cost wrongly.** That cost is in the per-kind SQLite table, the per-kind store class, and the constructor-site sweep. It is not in the registry, the runner, or the dispositions, which are shared and total by construction and should not change.

So the argument for a kind-agnostic payload store is made here, and it is narrow. Add `local_outbox(id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_json TEXT NOT NULL, sync_state TEXT CHECK, attempt_count, last_error, created_at, next_attempt_at, owner_tenant_id, owner_user_id, parked_at, parked_code, terminal_at, terminal_code, settled_at, server_id TEXT)` and one `SqliteOutboxStore` that implements `owed`, `owedCount`, `recover`, `claim` and `record` parametrised by kind, with the owner predicate in the query. A new kind then supplies a payload type and codec, `perform`, `onThrow`, `classify`, and `nextAttemptAt`, and nothing else; `OutboxDeps` carries one `outboxStore` for every generic kind, so the 67 constructor sites stop growing. The three existing kinds stay on their tables for ever: a live queue is never migrated, and the phone's `local_bills` columns are read by screens. The design's own rule that a binary payload must never be a field of the row stands: a photo kind's payload is a descriptor, section 4.

Ordering a payment behind its bill on the same device is the mechanism `resolveParkedSeller.ts` already implements for bills behind local sellers: `owed()` for the payment kind excludes a payment whose bill is not yet settled. On the server, `POST /payments` answers an unknown `bill_id` with 424, not 422. The lesson's question decides it: what would have to become true for this to be valid is a fact about the client's queue, not the payload, and the cost of 422 is a terminal refusal of cash already handed over.

---

## 3. Who may do what

**What exists.** `users.role text CHECK IN ('admin','staff')` (`users_role_check` at head), resolved from the row on every request (`auth.py:192-230`), gated by `require_admin` at 29 sites, by two inline reads for money visibility, and mirrored on the phone by five separately named predicates in `deviceRole.ts:245-320` that all read `role !== "staff"`. That file's last comment says in its own words that the five are "the map of what to convert." `tenants.staff_money_visible` is a permission wearing a toggle's clothes: E1 defines it as "staff may see their own money figures".

### 3.1 The set is code; the assignment is data

A permission is a gate at a code site. A permission nobody checks means nothing, and a permission invented as a row cannot be enforced. So the SET of permissions is a closed enumeration in the server, and the ASSIGNMENT of permissions to roles and roles to users is per-tenant data.

| table | columns | rules |
|---|---|---|
| `permissions` | `code text PRIMARY KEY`, `description text` | global, no `tenant_id`, outside RLS in the way `plans` and `server_clock_watermark` are; written only by migrations; the app role holds SELECT only. A boot-time check refuses to serve if this table's code set is not equal to the server enum, the S6 set-equality shape, failing closed like `JWT_SECRET` |
| `roles` | `id uuid`, `tenant_id`, `code text`, `name text`, `is_system boolean NOT NULL`, `is_active boolean NOT NULL DEFAULT true`, `payment_limit_per_bill NUMERIC(14,2)` nullable, `payment_limit_per_shift NUMERIC(14,2)` nullable, `created_at` | `UNIQUE (tenant_id, id)`, `UNIQUE (tenant_id, code)`; a system role cannot be deactivated or have its code changed; audited |
| `role_permissions` | `tenant_id`, `role_id`, `permission text` | `PRIMARY KEY (tenant_id, role_id, permission)`, composite FK to `roles`, FK to `permissions(code)`; audited |
| `users.role_id uuid NOT NULL` | new, composite FK to `roles(tenant_id, id)` | replaces `users.role`; the CHECK is dropped the way 0015 dropped the letter CHECKs |

The migration creates, per tenant, three system roles named exactly as S9 has them: `owner`, `admin`, `staff`. It grants `owner` and `admin` every permission except that only `owner` holds `licence.manage` and `roles.manage`, and it grants `staff` the set today's gates give staff: `bills.create`, `bills.read`, `sellers.create`, `shop.read`, `tiers.read`, plus `money.view_own` where the tenant's `staff_money_visible` is true. Then it sets `users.role_id` from `users.role` and drops the column and its CHECK. S9 is not overturned by this; its three roles become the three rows every shop is born with. What it adds is that a shop may create a fourth, and blueprint 8.2's cashier, manager, accountant and read-only are default templates the wizard offers, not rows the vendor decides for anyone. A3's collision resolves without reopening S9: the cashier is a role a shop creates, holding `money.view_shop` and `payments.record` and not `bills.create`.

The permission enumeration, at the granularity the 29 gates and the two inline reads need today, with the blueprint's additions:

`bills.create`, `bills.read`, `bills.read_all_users`, `bills.void`, `payments.record`, `payments.void`, `shifts.manage`, `money.view_own`, `money.view_shop`, `prices.write`, `master.write`, `sellers.create`, `sellers.write`, `sellers.read_personal`, `tiers.manage`, `users.manage`, `roles.manage`, `shop.settings.write`, `audit.read`, `reports.export`, `files.read_personal`, `approvals.decide`, `licence.manage`.

### 3.2 What each of the 29 sites becomes

`require_admin` is replaced by a dependency factory `require(permission)` returning a `Principal` whose `permissions` is a frozenset read in the same query `get_principal` already runs, one join through `roles` and `role_permissions`. The refusal keeps its 403 status and its `forbidden` kind; `code` becomes the permission name, `permission_required`, with `required_permission` in the body, so the client's wording stays a function of code and call site. Site by site: the 20 in `master.py` become `master.write` (uoms, categories, products), `prices.write` (the price PUT), `sellers.write` (seller PATCH, activate, deactivate), `tiers.manage` (3), `shop.settings.write` (PATCH /shop); the 7 in `users.py` become `users.manage`; `bills.py:700` becomes `bills.void`; `reports.py:434` becomes `money.view_shop`. The two inline reads at `master.py:1119` and `reports.py:948` become `principal.has("money.view_shop")` and, for the own-rows scope, `principal.has("money.view_own")`, which subsumes `staff_money_visible`: the column is dropped in the same migration after its value is folded into the staff role, and `PATCH /shop` refuses the key thereafter. The client's `mayShowDashboardEntry` reads the cached permission set instead of the toggle.

The last-active-admin guard generalises to the last active user holding `users.manage`, keeping its `FOR NO KEY UPDATE` lock over the set, which `prove_user_admin.py` already proves with its barrier.

### 3.3 The phone

The token gains a `permissions` claim, advisory exactly as `role` is today. The device stores the set in a STRICT table `cached_permissions(permission TEXT PRIMARY KEY)` written at sign-in and at every `/whoami`, so the cold-start-offline case `deviceRole.ts` argues for is served. The five predicates become one `may(permission)` over the cache, and it fails open on an ABSENT cache for the file's own reason, not on an absent permission: a set that was read and lacks `bills.void` hides the button. That is a narrowing of today's fail-open and it is deliberate; the server remains the authority on every request.

### 3.4 Licensing enters here and nowhere else

A licence status withholds capabilities. The withheld set per status is data the provider sets globally, `licence_status_withholdings(status, permission)`, and the effective permission set of a principal is the role's set minus the withholdings of the tenant's current licence status. One gate, one refusal shape with a distinct code `licence_withheld`, and D3 of `ROADMAP.md` is enforced by the content of that table: `bills.create` and `payments.record` appear under no status. Section 6 holds the rest.

**What breaks it.** A gate written as `principal.role == "admin"` again; a permission string at a call site that is not in the enumeration (the factory takes the enum, so this is a type error, not a runtime miss); a server that trusts the token's `permissions` claim; a licence check bolted onto routes as a second mechanism.

**What proves it.** For every route, a proof that holds a principal with every permission but the one the route needs and reads 403 with `code = permission_required` naming it, and the positive sibling with the full set reading the route's own success status; the swap disproof that already exists for `GET /users` generalised to every site, exactly N cells moving for N sites; the boot refusal on a catalogue mismatch, staged by inserting one extra row on a scratch; a reconcile check S7 that every tenant has at least one active user holding `users.manage`.

---

## 4. Things that are not rows

**What exists.** Nothing. `git grep -inE 'photo|image|upload|blob'` over `server/app` and the migrations hits only the jsonb images in 0017 and one docstring heading. The phone's SQLite moves only `string | number | null` across its driver and has no BLOB column (`ROADMAP.md § P1.18`, "What is NOT carried"). S12 requires three photographs, S14 makes a photo an outbox kind, S15 puts the bytes beside the database and leaves retention, resolution and the physical "beside" open.

### 4.1 The record of a file is a row; the bytes never are

| table | columns |
|---|---|
| `files` | `id uuid PRIMARY KEY` (client-minted, taken offline), `tenant_id`, `branch_id`, `kind text CHECK IN ('bill_evidence','seller_id_card','seller_face','staff_face','product_image','shop_logo','expense_receipt','payment_slip','diagnostic')`, `sensitivity text CHECK IN ('ordinary','personal')`, `bill_id`, `seller_id`, `user_id`, `product_id`, `cash_movement_id`, `payment_id` (all nullable uuid, each a composite FK to its parent), `sha256 bytea NOT NULL`, `byte_size bigint NOT NULL CHECK > 0`, `mime text NOT NULL`, `width integer`, `height integer`, `device_captured_at timestamptz NOT NULL`, `server_received_at timestamptz`, `status text CHECK IN ('pending','stored','purged')`, `storage_key text`, `encryption_key_id text`, `retain_until timestamptz`, `purged_at`, `purge_reason`, `created_by uuid NOT NULL` |

Three CHECKs carry the shape: exactly one subject column is non-null and it is the one `kind` implies (the `ck_audit_log_images` pattern); `sensitivity = 'personal'` for the two ID kinds and the staff face; `status = 'stored'` implies `storage_key` and `server_received_at` non-null, and `status = 'purged'` implies `purged_at` and keeps `storage_key` null. The row outlives the bytes. A purged file is a record that a photo existed and was deleted under a rule, which is what a compliance officer and a seller exercising a right both need to see.

The bytes live under one root on the owner's machine (S13), keyed `{tenant_id}/{kind}/{id}`, behind an interface with one implementation today and an S3-compatible one when hosting changes. `sha256` is the identity of the bytes: verified on upload completion, used by `verify_backup` to sample the file root against the manifest, and used by a reconcile-style script that asserts the key space of the root equals the set of `stored` rows in both directions, the lesson of `a-round-trip-must-agree-on-its-key-space` applied to a directory.

### 4.2 Access, and it is the part designed most carefully

Every byte is served through the API and nothing else. `GET /files/{id}` reads the row under the caller's tenant context, so RLS decides membership before any path is touched; then it checks `files.read_personal` when `sensitivity = 'personal'`; then it streams. No static file route, no signed URL for a personal file, because a URL is a bearer credential that outlives the request that minted it. A short-lived signed URL is permitted for `ordinary` kinds if a cache ever needs one, and is not built now.

Every read of a personal file is audited. The 0017 trigger records writes only and `recycle_app` holds no INSERT on `audit_log`, so the read audit is a `SECURITY DEFINER` function `audit_file_read(file_id)` writing a row with `action = 'READ'`, which widens `ck_audit_log_action` by one value. That is D3's "every provider read" extended to the one class of shop-side read that is sensitive, and it is the only read this system audits.

Personal files are encrypted at rest with a server-held key named by `encryption_key_id`, because the backup copies the file root off-box and the root is then in two places. No key means the server refuses to store a personal file; it does not store it in clear, the `config-defaults-must-fail-closed` direction.

### 4.3 A photo taken offline

The bytes go to the device filesystem first, never SQLite. A descriptor row goes into `local_outbox` as kind `file_upload` with payload `{id, kind, subject local id, path, size, sha256, offset}`. `perform` sends `POST /files` with the metadata, idempotent on `id`, then `PUT /files/{id}/bytes` with a content range from `offset`; `record` writes the new offset; `nextAttemptAt` returns now for a bounce that advanced the offset and a real delay for one that did not. This is precisely the four-point specification in `ROADMAP.md § P1.18` "A MULTI-MEGABYTE BINARY WITH RESUME SEMANTICS", and nothing in the runner changes. The subject reference is resolved the way a parked bill's local seller is: the descriptor names a local bill id, and `owed()` excludes it until the bill has settled and `server_id` is known.

The print-gate finding in `OPEN_ITEMS.md` ("THE PRINT GATE AND THE PHOTOGRAPH DISAGREE") is answered structurally and not decided: a `files` row with `status = 'pending'` tells the desktop a photograph is owed and has not arrived, so all three of the owner's options are drawable from data. Which one is his.

### 4.4 Retention

`retain_until` is written at creation from the tenant's policy and is a fact about the promise made at that moment, never recomputed. A purge script, run by a person like the backups are until a scheduler exists, deletes bytes where `retain_until` has passed and `status = 'stored'`, encrypts nothing and unlinks, and sets `purged`. It refuses to run at all for a tenant whose `personal_data_retention_days` is null, section 5, because deleting what a statute may require to be kept is the one mistake that cannot be undone in either direction.

**What breaks it.** Bytes present with no row, or a row `stored` with no bytes (the two-direction check catches both); a personal file served without an audit row (a proof reads the file and asserts the audit row exists, and the disproof removes the function call and watches that cell alone move); a purge that deletes the row; a `files` row referencing a subject in another tenant (the composite FKs make it unrepresentable).

---

## 5. The shop's own identity and the law

**What exists.** `sellers` at head: `id, tenant_id, code, name, phone, grade, is_active, id_number, address, vehicle_no, created_by`, all identity fields nullable with 0004's reason that a walk-in is paid before the yard has their address. `tenants` has `address` and `phone` and deliberately no tax id or licence number, which 0013 sends to P1.1. P1.1 is unscheduled; the legal research round's four stated limits stand.

### 5.1 The shape is configurable; the columns exist regardless

The columns a statute could require are added now, nullable, so that P1.1's answer changes DEFAULTS and never DDL on the transactional table. That is D10's argument applied one step earlier than P1.1 itself.

- On `sellers`: `seller_type text CHECK IN ('person','company','walk_in')` nullable, `tax_id text`, `line_user_id text`, `credit_limit NUMERIC(14,2)` nullable, `internal_note text`, `consent_recorded_at timestamptz`, `consent_version text`, `consent_recorded_by uuid`, `id_number_hmac bytea` (see 5.4), `personal_data_erased_at timestamptz`.
- Sub-tables by kind: `seller_vehicles(tenant_id, seller_id, plate text, is_primary)`, `seller_bank_accounts(tenant_id, seller_id, kind CHECK IN ('promptpay','bank'), bank_code, account_no, promptpay_id, holder_name, is_primary)`, `seller_flags(id, tenant_id, seller_id, kind CHECK IN ('watch','blocked'), reason, created_by, created_at, cleared_at, cleared_by)`.
- On `purchase_bill_items`: `item_ref text` nullable, the per-line serial the act may require for identifiable goods, added in the money migration because that table is rewritten there once.
- On `purchase_bills`: `seller_identity_recorded boolean NOT NULL DEFAULT false`, a fact stamped at write time by the server from the seller row and the tenant's requirement policy, never recomputed, the `list_price` shape.
- On `tenants`: `tax_id text`, `dealer_licence_no text`, `dealer_licence_expires_on date`, `personal_data_retention_days integer` nullable with a CHECK against bounds that are null until P1.1 answers, and the five requirement booleans from section 1.

The requirement policies are enforced on the PHONE at the moment of work, where the switch is on, and recorded on the SERVER as a fact about the bill. The server never refuses a bill for missing paperwork. The reason is the same one that decides section 1.3: refusing the record does not undo the purchase, it hides it from the books, and a shop that bought without an ID is better served by a report of every such bill than by a bill that never reached the server. This is where "the shop decides" is not the whole answer: the statute binds the shop whether or not its switch is on, so the compliance report exists regardless of the switch, the new-shop default for `require_seller_id_number` becomes true the day P1.1 confirms the obligation, and the register export exists as a report over existing columns.

### 5.2 The register

The second-hand goods register is a report over bills, lines, sellers and files across a date range in a statutory layout, printed or exported. It needs no table if the columns above exist, and its layout is a template that P1.1 fills in. A shop that keeps a paper book still has the report.

### 5.3 What P1.1 changes, and what it does not

It changes: which requirement booleans default to true for a new shop; whether `item_ref` is mandatory in the phone's flow for some product categories; the two retention bounds in the CHECK on `personal_data_retention_days`; the register template; the consent text version. It does not change: any table, any key, RLS, the file subsystem, bill immutability, or the acceptance rule on any write path. If the answer is that the act does not bind bulk scrap sold by weight, every column stays and every default stays false, and nothing is removed.

### 5.4 Consent, erasure, and the network watchlist door

Consent is three columns recorded at ID capture with the text version the seller agreed to. Erasure under PDPA is a mechanism over structure that already permits it: blank the personal columns on `sellers`, purge the personal `files`, stamp `personal_data_erased_at`, and keep the row, the code, the bills, and the audit trail, which the 0017 trigger writes for the UPDATE. The bounds P1.1 owes are the legal minimum retention that erasure must not cut short, which is why the purge refuses while the bounds are unknown.

The shared network watchlist in blueprint 5.3 is not designed here and the PDPA question is the lawyer's. The door left open costs one column: `id_number_hmac`, an HMAC of the ID number under a server key computed on write, so that a future cross-shop relation outside RLS can be keyed on it without any shop's number leaving its tenant. Whether that relation should ever exist is the owner's and the lawyer's.

---

## 6. Being a product, not a program

**What exists.** No licence, plan, activation or billing structure anywhere (`SRS_MAP.md § 7a`, re-measured: the three code hits for `licen[cs]e` are prose in `outbox.ts`, `outboxRunner.ts` and 0013). D1 through D3 in `ARCHITECTURE.md § 10` decide the provider's seat, the per-tenant loop, and the audit log; `directory.shop_codes` and `recycle_directory` exist; ROADMAP's D3 decides a lapse never stops trading; S9 makes the owner account transferable; S1's extension puts activation on the desktop while P3.5 puts it on the provider web, flagged unreconciled since 2026-08-26.

### 6.1 The boundary and where it is enforced

The provider controls the licence's existence, plan, dates and status. The shop controls everything inside the tenant. The boundary is enforced by the SERVER, at the permission gate of section 3, and nowhere else: not on the phone, which is the shop's device and bypassable, and not in a signed licence file the desktop validates offline, which is a second authority that drifts. The phone and desktop learn the status from `GET /shop/licence` and render a warning; offline they use a cached status and its `ends_at`, and a cached future date is a claim about a clock, so the client only warns and never withholds.

### 6.2 Tables

| table | where | columns |
|---|---|---|
| `plans` | global, outside RLS, SELECT-only for the app role, written by migrations or the provider service | `code text PRIMARY KEY`, `name`, `max_users integer`, `max_branches integer`, `max_bills_per_month integer` nullable, `monthly_price NUMERIC(14,2)`, `is_active` |
| `licences` | tenant table under RLS | `id`, `tenant_id UNIQUE`, `plan_code FK plans`, `status text CHECK IN ('trial','active','grace','suspended','terminated')`, `starts_at`, `ends_at`, `grace_until`, `activated_at`, `activated_by_key_id`, `max_users_override integer` nullable, `updated_at` |
| `licence_events` | tenant table, append-only | `id`, `tenant_id`, `licence_id`, `at`, `from_status`, `to_status`, `actor_provider_user_id`, `reason` |
| `licence_status_withholdings` | global | `status`, `permission FK permissions` |
| `directory.activation_keys` | directory schema, no RLS, the prohibition 0009 states applies: no shop data | `key_hash bytea PRIMARY KEY`, `plan_code`, `issued_at`, `issued_by_provider_user_id`, `used_at`, `tenant_id` nullable |
| `provider_users` | outside the tenant model per D1, own secret, own service | `id`, `username`, `password_hash`, `is_active`, `token_version` |
| `provider_audit_log` | outside the tenant model, append-only | `id`, `at`, `provider_user_id`, `action`, `tenant_id`, `detail` typed columns |

`licences.status` is mutable and audited by the trigger; `licence_events` is the history. Two writers reach the same state, which S9 requires: `provision_shop.py` today writes a tenant, an admin, a tier and a shop code, and it gains the licence row; the provider service, when it exists, does the same through the key. Activation therefore reconciles the S1 and P3.5 flag this way: the activation SURFACE is the desktop, because that is where the owner types the key; the activation WRITER is the provider service, because creating a tenant, its shop code and its licence needs `recycle_owner`, a role the shop API never connects as (`provision_shop.py:9-16` measured this). The desktop calls the provider service for that one act and the shop API for everything else. This is a reading of two settled statements, not a new decision; the owner confirms it or corrects it.

### 6.3 Expiry, grace, suspension, reactivation

Status is derived from dates by the server at read time inside the request, `active` until `ends_at`, `grace` until `grace_until`, then `suspended`, and the stored `status` is advanced by the provider service or by the same read when it finds the dates passed, writing an event either way. Every request's principal resolves the tenant's status in the same transaction as its permissions, the property `get_principal` already has for the role. What each status withholds is the withholdings table's content, and the floor is D3: under every status a shop can create bills, record payments, read all its own data, and export it. Suspension withholds adding users, master-data writes beyond activation state, exports beyond its own data? No: exporting its own data is a right and stays. Reactivation is a provider event that moves status back and writes nothing else. Termination after N days is the only path that could ever delete a tenant's rows, and it is not designed here; the audit log's exclusion from X2 already anticipates a deleted tenant.

Plan limits are enforced at the write that would exceed them: `POST /users` refuses 409 `plan_limit_reached` when active users would exceed the plan or the override; `POST /branches` the same for branches.

### 6.4 Billing artefacts

An invoice bills a licence, so this waits on the accountant (P3.9), and the structure is provider-side: `provider_invoices(id, tenant_id, licence_id, doc_no, period_from, period_to, amount, vat_amount, withholding_expected NUMERIC(14,2), status, issued_at, pdf_file_id)` and `provider_receipts`. `doc_no` is a gap-free provider sequence minted the way `doc_no_counters` mints a shop's, one counter row under a lock, never a native sequence. The 3% withholding is the SHOP's obligation on a service fee: the shop pays 97% and supplies a certificate; `withholding_expected` and a `certificate_received_at` on the receipt hold it. Whether the fee is a withholdable service is the accountant's answer, and the column is nullable until it comes.

**What breaks it.** A licence check anywhere but the permission gate; a client that refuses work on a cached expiry date; a plan limit checked on the phone only; a second set of provider principals inside `users`, which D1 forbids and the migration proves by altering nothing on `users`.

---

## 7. Reaching people

**What exists.** No notification, push token, LINE, or device table; the one code hit for those words is `Press.tsx`'s haptics. The API process already runs one background task, `clock_guard.tick_forever` (`main.py:67`), and the system otherwise has no scheduler by decision.

### 7.1 One mechanism: an event, then deliveries

Owner alerts (6.2), the closing summary (6.3), the in-app centre (10.3), every LINE message to an owner or a seller (11.1 to 11.4), and a support-ticket status are one thing wearing different clothes: a durable **notification** addressed to a recipient, and one **delivery** attempt per channel.

| table | columns |
|---|---|
| `notifications` | `id`, `tenant_id`, `kind text CHECK` (a closed set: `bill_over_threshold`, `bill_voided`, `price_changed`, `shift_variance`, `new_device_login`, `bill_parked`, `daily_summary`, `payment_advice`, `price_announcement`, `slip_mismatch`, `approval_requested`, `support_reply`), `recipient_user_id`, `recipient_seller_id` (exactly one non-null), `bill_id`, `payment_id`, `shift_id`, `subject_user_id`, `amount NUMERIC(14,2)`, `threshold NUMERIC(14,2)`, `count integer` (nullable facts, one CHECK per kind on which are present), `created_at`, `read_at` |
| `deliveries` | `id`, `tenant_id`, `notification_id`, `channel text CHECK IN ('in_app','push','line','sms')`, `address text`, `status text CHECK IN ('pending','sending','delivered','failed','terminal')`, `attempt_count`, `next_attempt_at`, `claimed_at`, `sent_at`, `provider_ref`, `rendered_text text`, `last_error` |
| `user_devices` | `id`, `tenant_id`, `user_id`, `device_id uuid`, `platform`, `push_token text`, `app_version`, `first_seen_at`, `last_seen_at`, `revoked_at` |
| `user_channels`, `seller_channels` | `tenant_id`, owner id, `channel`, `address` (a LINE user id, a phone number), `verified_at`, `preferences` as typed booleans per kind, `quiet_from`, `quiet_to` |
| `tenant_line_channels` | `tenant_id UNIQUE`, `channel_id`, `channel_secret_ciphertext`, `access_token_ciphertext`, `key_id`; absent means the provider's central OA sends on the shop's behalf |

The notification row stores facts, never text. The delivery renders text at send time in the recipient's locale from a server-side template catalogue, the one server-side language catalogue this design has, and stores what it sent in `rendered_text`, because a sent message is an artefact. `user_devices` is also blueprint 8.7's device list with per-device revocation, and it gives `seller_code_reservations.device_id` the relation it lacks; that FK is added only after every existing reservation's device has a row, which the migration checks and refuses otherwise.

### 7.2 The sender

The sender is a second background task in the API process, beside the clock guard, draining `deliveries` on a tick. It is the server-side outbox and it inherits the phone's rules with their lessons: claim a row with a conditional UPDATE from `pending` to `sending` so two workers never send one delivery; sweep `sending` back to `pending` at startup; classify the provider's answer three ways, unknown retries with backoff, a permanent refusal goes `terminal`, a resolvable one such as an unverified LINE address parks; use the delivery id as the provider's idempotency key where the provider offers one. The daily summary is the first scheduled thing in the system: the same tick asks, in shop time, whether closing time has passed and no `daily_summary` exists for the day, and creates the notification. That is a scheduler, stated as one, and it is the smallest possible.

### 7.3 What is genuinely separate

- **In-shop chat** is a conversation store, `conversations` and `messages` with read state, keyed on `users` and `tenant_id` exactly as blueprint 16 says. It is not event-driven and shares nothing with notifications except the push delivery for "new message", which is one notification kind. Any time.
- **Support** is a conversation with the provider: provider-side tickets, and the client's "report a problem" is a `files` row of kind `diagnostic` plus a notification to the provider. The channel is the provider's LINE OA, which is a `deliveries.channel = 'line'` row whose recipient is a provider user.
- **The seller-facing surface** (11.5, 5.7, the web price page) is the one thing here that is not a notification and not a client of the existing tiers. A seller reading their own history needs a principal that is not a `users` row, whose RLS context is a tenant plus a seller, which means a fourth authentication tier and a second GUC the policies do not read today. That opens the LOCKED architecture's client count and is not designed here. The door kept open costs nothing: seller ids are stable, bills reference sellers by composite FK, and `seller_channels` holds the LINE user id such a login would resolve.

**What breaks it.** Rendered text stored on the notification (untranslatable, unrepairable); a delivery sent twice because the claim was a plain SELECT; a notification kind added without its fact CHECK; a push token read from the phone's request body without a device row.

---

## 8. The language layer

**What exists.** Server refusals carry a `message` that clients are forbidden to print (`auth.py:31-44`, and `master.py`'s Thai messages are under the same rule). The client owns every sentence, keyed on code and call site, and the proofs assert those sentences negatively over the rendered concatenation with presence siblings, the discipline of `correct-classification-can-still-render-as-an-error`. So the server needs no language layer for refusals at all; the language layer is the client's and, for notifications, the server's template catalogue.

### 8.1 Storage

`users.locale text NOT NULL DEFAULT 'th' CHECK IN ('th','en','my','km','lo')`. The set is closed by the CHECK and by the catalogue; adding a language is a migration and a catalogue file. The token carries `locale` as advisory display data; `local_identity` gains a `locale` column so the phone renders the right language on a cold start; the login screen honours the device language before anyone is signed in and offers the choice.

### 8.2 The migration path that keeps the oracle meaningful

The catalogue is one module per locale under `src/i18n/`, and the key type is derived from the Thai module: `type MessageKey = keyof typeof th`. Every other locale is a mapped type over that key set, so a missing translation is a compile error in both typecheck programs, the registry-totality pattern `outbox.ts:123-125` already uses. A function `t(locale, key, params)` replaces literals module by module.

The proof suite's Thai strings are the ORACLE and they must not move. Two rules keep them meaningful:

- **Proof expectations stay literal Thai.** A proof never imports the catalogue; a proof that compared `render()` against `th[key]` would prove the code equals itself, which is `a-checker-must-not-share-the-code-it-checks` exactly. The 686 literal lines in `src/proof` are kept as they are.
- **The migration is proven by byte identity.** The Thai catalogue's values are the old literals, byte for byte, and the moves-only check from `comment-thai-pollutes-a-moves-only-diff` applies: added tracked Thai outside `src/i18n/th.ts` is zero, and every removed literal reappears once in the catalogue. Under those two facts every existing proof stays green for the reason it was green before, and a proof that goes red is a real reword.

A second locale is proven without anyone here reading it: a smoke proof renders every screen state under each locale and asserts, negatively, that no codepoint in the Thai block appears when `locale !== 'th'`, with the same render under `th` as the presence sibling. That catches an untranslated leak and asserts nothing about Burmese wording, which no proof here can judge.

### 8.3 Numbers and dates

The collision named in the brief is already resolved in the tree in the only way hard rule 1 allows. `format.ts` groups by string surgery over the server's decimal string, and the invariant `stripSeparators(display(x)) === x` is proven. Per-locale grouping is therefore one table of separators and one more loop in `proveMoney` M5 over every locale. Two rules are added and written down: digits are ASCII end to end and never transliterated into a script's own numerals, because a money string's digits are what the server produced; and `doc_no` is rendered in the Buddhist era whatever the user's locale, because it is the shop's legal series, not the reader's preference. Unit words and the era label are catalogue entries. `ARCHITECTURE.md § 5` needs a dated supersession for its "no thousands separators" sentence, which is a documentation correction owed and not this design's.

---

## 9. One shop or many

**What exists.** Nothing. The word `branch` occurs 160 times across server and mobile code and every hit is prose or Alembic's `branch_labels` (the grep is word-anchored; I read a sample and did not read all 160, so the count is measured and the classification is a spot check). The 2026-09-02 review measured the two shapes as `branch_id` on fourteen tables against branch-as-tenant with an organisation above.

### 9.1 The decision: a branch is a row inside the tenant, and every tenant has one from birth

`branches(id, tenant_id, code, name, address, phone, doc_prefix text NOT NULL DEFAULT 'B', is_active, created_at)` with `UNIQUE (tenant_id, id)` and `UNIQUE (tenant_id, code)`. Provisioning creates one branch per tenant the way 0015 created one tier; the derived switch is the count. Every operational row carries `branch_id uuid NOT NULL` with a composite FK to `branches(tenant_id, id)`: `purchase_bills`, `payments`, `cash_movements`, `shifts`, `files`, `notifications`, `deliveries`, `user_devices`, and `doc_no_counters`, whose primary key becomes `(tenant_id, branch_id, be_year)`. `users.branch_id` is nullable; null means every branch, which is the owner and the accountant, and a role gains `branches.all`. `product_prices.branch_id` is nullable with null as the shop-wide list and a non-null row as a branch override, resolved branch-first at bill create. Sellers, tiers, products, categories, units and containers are shared master data and carry no branch.

`doc_no` becomes `{doc_prefix}-{be_year}-{seq}`, and the born-with branch keeps prefix `B`, so no existing series changes and the partial unique index on `(tenant_id, doc_no)` stands. T8's `DOC_NO_RE` at `reconcile.py` widens to the prefix.

### 9.2 The defence

- **Sellers are the supplier relationship the yard lives on, and they are shared.** Under branch-as-tenant a supplier who sells to two yards is two rows in two code namespaces with two histories, and P1.21's history screen shows half a person.
- **Consolidated reporting and transfer between yards are within-tenant reads and writes under this shape.** Under the other they are cross-tenant, which is the property this system is strongest at forbidding, and the only cross-tenant reader is a superuser script by design.
- **The owner is one principal.** S9's transferable owner account is one row holding the owner role; under branch-as-tenant it is N accounts for one person, and every gate that says "the shop owner decides" has to say which.
- **The licence is per business.** Plans count branches, which is a column comparison here and a join across tenants there.
- **RLS is untouched.** Branch is a filter and a composite FK, never a second GUC. An "all branches" context would be the unset-means-all shape the tenant predicate refuses, and it is refused here too: a request's branch scope is a property of the principal, checked in the handler, and the composite FK forbids a bill in branch X of tenant A naming a branch of tenant B.

### 9.3 What it costs to defer, and what it costs to choose wrongly

Deferring is not "rebuild the whole database", and the blueprint overstates it. Adding `branch_id NOT NULL` later is a per-tenant backfill to the one existing branch under the NO FORCE idiom 0015 measured, a rewrite of the counter's primary key, one sweep over every handler and every proof, one nullable column on `local_bills`, and one column on `local_shop`. It is a wide, boring migration on live money rows, and it grows by one table and several proofs every phase. Choosing branch-as-tenant and needing this later is the rebuild: re-homing whole tenants' rows into one, with id and code namespaces colliding. Choosing this shape and never needing a second branch costs one column that is always the same value. The asymmetry decides it, and the timing decides itself: the sweep is cheapest at seventeen tables with no real row, which is now.

**What it does to the spine.** Section 1's rule about where a policy lives exists because of this section; without branches, every policy is a `tenants` column and the rule collapses to that. The three columns already on `tenants` stay there because they are the business's.

**What proves it.** A proof creates a second branch on a scratch, writes a bill in each, and reads two independent `doc_no` series with two prefixes; the reconciler's T8 runs per `(tenant, branch, year)`; a principal scoped to branch A is refused 403 recording a payment in branch B and the disproof deletes the handler check and watches exactly that cell; X1's cross-tenant join gains the branch pair.

---

## 10. The invariants

Written in the style the codebase uses, so a builder can hold a diff against them.

1. **A switch is never read on a write path's acceptance test.** The server accepts or refuses against master-data rows; a policy selects who performs a transition, never whether the transition exists.
2. **Every declared policy is a typed column with a CHECK on `tenants` or `branches`, named in `ShopPolicy`, and audited by the trigger.** No table of keys, no JSON, no flag anywhere else.
3. **A bill's payment status is derived from allocations and stored nowhere.** `sum(allocations of a payment) <= payment.amount`; `sum(live allocations to a bill) <= bill.total_amount`.
4. **`amount = round(quantity * unit_price, 2)` on every line, whatever the basis; `total_amount = sum(amount) + rounding_adjustment`.** The reconciler duplicates the arithmetic and imports nothing.
5. **Money leaving the shop is a `payments` row, client-minted, idempotent per tenant, voided never deleted, and it exists for every shop.** A cash-only shop is the case where the server wrote it.
6. **The set of permissions is code; the assignment is data; the gate reads the row.** No handler compares a role name; no gate trusts a token claim; the catalogue in the database equals the enumeration in code or the server does not start.
7. **A licence withholds through the permission gate and through nothing else, and it withholds neither `bills.create` nor `payments.record` under any status.**
8. **Bytes are never in Postgres and are never served except through a handler that resolved the row under tenant context.** A personal file's read writes an audit row; a purge deletes bytes and keeps the row; the file root's key space equals the set of `stored` rows in both directions.
9. **A personal file is encrypted with a named key or is not stored.**
10. **A branch is a composite FK inside the tenant and never a GUC.** Every operational row has one; every tenant has at least one; `doc_no` is unique per tenant and its series is per branch.
11. **A notification stores facts, a delivery stores what was sent, and a delivery is claimed by a conditional UPDATE before any send.**
12. **Proof expectations are literal Thai; production reads the catalogue; the catalogue's Thai values are the former literals byte for byte.** A proof that imports the catalogue proves nothing.
13. **A money string's digits are ASCII and are never parsed to be regrouped**; `stripSeparators(display(x)) === x` in every locale.
14. **Every new tenant table enters `TENANT_TABLES`, and every new master-data table enters `_AUDITED_TABLES` and S6, in the migration that creates it.** The reconciler's S2 red is the checker working.
15. **A row a shop's statute may require to be kept is never deleted by a mechanism whose retention bound is unknown.**

---

## 11. The build order

Every edge below is a structural dependency, not a preference. Schema decisions batch into one migration where a later batch would otherwise rewrite the earlier one's table.

**Batch A, the spine and its scope.** `permissions`, `roles`, `role_permissions`, `users.role_id` replacing `users.role`, `branches` with `branch_id` on the tables that exist today, `doc_no_counters` re-keyed, `users.branch_id`, `users.locale`, `ShopPolicy` with the first declared columns. Why one batch: roles carry a branch scope, and `staff_money_visible` folds into a role at the same moment `users.role` is dropped. Precedent: 0015 replaced live CHECKs with FKs and refused a downgrade that would lose a shop's own words; this migration replaces `users_role_check` the same way and refuses a downgrade that would lose a custom role. Trap: building the permission gates before the catalogue table exists produces string literals at 29 sites that nothing checks.

**Batch B, money.** `payments`, `payment_allocations`, `shifts`, `cash_movements`, `approvals`, `containers`, the bill-line rewrite, `rounding_adjustment`, the branch and role policy columns. Depends on A for `branch_id` and `payments.record`. Trap: building this before A puts a `branch_id` sweep on four new tables; building any counter SCREEN before the generic outbox store pays the 1,900 lines a fourth time. Precedent: the audit log lost every price change that preceded it, and this batch loses every payment that precedes it; on production none has happened yet, which is the argument for landing it before P2.1.

**Batch C, files.** `files`, the read-audit function, the `READ` action, the encryption key config, the file root. Depends on A for `files.read_personal` and `branch_id`; independent of B except `cash_movements.receipt_file_id`, which is nullable and can arrive with C. Trap: building the photo path before the generic outbox store repeats the void's nine-column bolt-on in binary.

**Batch D, seller identity and the law.** The seller columns and sub-tables, the tenant legal columns, the requirement booleans, `seller_identity_recorded`, `item_ref`. Depends on C for the photo FKs. `item_ref` rides B because the line is rewritten there. Trap: a purge job before the retention bounds exist.

**Batch E, reaching people.** `user_devices`, `notifications`, `deliveries`, channels, `tenant_line_channels`, the sender task. Depends on A for locale and branch; on B for the kinds that name a payment or shift.

**Batch F, licensing.** `plans`, `licences`, `licence_events`, `licence_status_withholdings`, `directory.activation_keys`, `provider_users`, `provider_audit_log`. Depends on A, because withholding is subtraction from a permission set, and on P3.3's process. Trap: a licence check written as a middleware or a per-route dependency is a second gate mechanism.

**The client work that is not a migration.** The generic `local_outbox` store and `cached_shop_policy` and `cached_permissions` on the phone; the catalogue and `t()`; the desktop's port of the shop-time module before any slip.

**Decidable and buildable today, with no owner input and no shop visit:** the permission model (S9 and blueprint 8.3 are settled; the three system roles are S9's), the generic outbox store (a pure client refactor), the `files` table (S12, S14, S15 settled), the payments ledger (under the owner's own principle, how any shop pays is not a question the vendor needs answered), the bill-line rewrite (blueprint 4.6 is level A and settled by adoption). **Needing the owner's yes:** branches, because the blueprint marks it "ตัดสินตอนนี้" and this document recommends the shape; the activation reading in 6.2; the two S-collisions below. **Needing an outside answer:** the retention bounds and the register template (P1.1), the invoice content (the accountant), the watchlist (the lawyer).

Where this design needs a settled statement moved, and leaves it to the owner: ROADMAP D8, "the desktop cashier is an admin", is superseded by a cashier role; A3 is resolved without reopening S9 as described in 3.1; the S1 extension and P3.5 are reconciled as surface versus writer in 6.2; the seller-facing surface in 7.3 would open the LOCKED client count and is not proposed. Nothing here overturns a hard rule; hard rule 8's third state is already filed as the owner's.

---

## 12. The first three units

**Unit 1: the permission model.** Builds batch A minus branches: `permissions` catalogue with the boot-time equality check, `roles` and `role_permissions` with the three system roles per tenant, `users.role_id` with `users.role` dropped, `staff_money_visible` folded into the staff role and dropped, `require(permission)` at all 29 sites and the two inline reads, the token's `permissions` claim, `cached_permissions` on the phone with `may()` replacing the five predicates, the generalised last-manager guard, the trigger on the two new tables, reconcile S7. It proves: per route, the all-but-one principal reads 403 with `code = permission_required` naming the permission and the full principal reads the route's success; every existing server and mobile proof green twice unchanged in its assertions except the cells that read `staff_money_visible`, which are edited by name; the boot refusal on a catalogue mismatch on a scratch; `prove_user_admin.py`'s race with the generalised guard. It must not touch: `purchase_bills`, any screen beyond the gating predicates, the provisioning script beyond the three role rows it now writes. Size: one migration, about 35 server sites, about 10 client files, two new proofs. The disproof that would show it wrong: a principal holding every permission but one reaching 200 on the route that needs it, or a route that still answers `admin_required`.

**BUILT 2026-09-04 — this PERMISSION MODEL unit, the SECOND built (unanchored;
anchor next pass), migration `0019_permissions.py`. What it did from the spec above:
the `permissions` catalogue with the boot-time equality check (`app/permissions.py`;
uvicorn exit 3 on an extra row and on a missing table, measured); `roles` and
`role_permissions` with the three system roles per tenant (13/12/3 grants at birth,
the fold of `staff_money_visible` into `money.view_own` written for every tenant
whose toggle was true — none on dev); `users.role_id` with `users.role` and its
CHECK dropped, every user re-keyed value against value; `require(permission)` at
34 route sites (the 29 `require_admin` sites plus the five any-principal routes
that section 3.2 leaves ungated and the cashier needs gated: `POST /bills`, both
bill reads, `POST /sellers`, the reservation top-up) and at the two inline reads;
the token's `permissions` claim (advisory; a claimless pre-0019 token still
resolves from the row); `cached_permissions` on the phone with `may()` replacing
the five predicates AND the three same-shape inline reads the pin at `b25d7b0`
missed (`dashboardView.ts:54`, `usersAdmin.ts:230`, `App.tsx:1568`); the
last-manager guard generalised to `users.manage` through an active role
(`FOR NO KEY UPDATE OF u`); the audit trigger on both new tables; reconcile S7.
**FOUR DEPARTURES FROM THE TEXT ABOVE, each the owner's decision of 2026-09-04:**
the catalogue is THIRTEEN codes, not 23 — the ten with no route in this tree are
recorded by name against their units in `app/permissions.py` `DEFERRED`, and one
of the thirteen, `roles.manage`, gates no route yet and says so at its line;
`roles` carries NO `payment_limit_*` columns (nothing reads them; they arrive with
unit 3); the phone's cache is `cached_permissions(user_id, permission)` keyed on
the user, not the sketch's one-row table, so a crash between a new token landing
and its set being written can never show one operator another's rights; and
`POST /users` gained an ESCALATION GUARD — a caller may assign only a role whose
grants are a subset of their own (403 `role_exceeds_caller`, `over_reach` named),
without which an admin mints an owner the day one exists. **AND ONE CORRECTION TO
THIS DOCUMENT'S OWN CLAIM ABOVE:** "every existing server and mobile proof green
twice unchanged in its assertions except the cells that read `staff_money_visible`"
was FALSE as written and section 12's own disproof is why — no route may answer
`admin_required`, so every proof cell that asserted it had to move too. Edited by
name: 12 server `check` sites in 6 files (`prove_master_write.py:315` is a 9-route
loop) plus the 2 `actual_role` cells, and the 7 `staff_money_visible` cells across
`prove_reports_summary.py`, `prove_seller_history.py`, `prove_shop_settings.py`;
on the phone the five predicate cells and every builder call that handed a role
LABEL moved to a permission SET (`src/proof/proofGrants.ts`), the assertions'
text unchanged, and the mobile proofs that stage `admin_required` stayed green
unchanged because the phone keeps that code as a LEGACY key for rows persisted
before the deploy. Six SQL-minting proofs were conscripted to seed the three
system roles before their users (0018's branch conscription, one table on).
Record: `PROJECT_STATUS.md § Current phase`. The role-management screen is NOT
this unit and is filed as owed; until it exists no shop provisioned before 0019
holds `roles.manage` (its owner seat is empty by design), and a shop provisioned
after it gets its first user as `owner`.**

**Unit 2: branches.** Conditional on the owner's yes to section 9. Builds `branches`, the born-with branch per tenant in the migration and in `provision_shop.py`, `branch_id NOT NULL` on `purchase_bills` and `doc_no_counters` with the re-keyed primary key and `doc_prefix`, `users.branch_id` with `branches.all`, `local_shop.branch_id` on the phone with the bill payload carrying it, T8 widened, X1 widened, `GET /shop` returning the caller's branch. It proves: on a scratch, two branches mint two independent series `B-2569-1` and `C-2569-1`; every existing bill reads back with the born-with branch and its `doc_no` unchanged, compared value against value; the branch-scoped principal is refused across branches with the deletion disproof moving exactly that cell; `reconcile.py` exit 0 on live and on a restored copy. It must not touch: prices, sellers, tiers, the payment tables. Size: one migration, `bills.py` and `reports.py`, two mobile store files, two proofs. The disproof: two branches sharing one counter row, or a bill accepted with a `branch_id` from another tenant.

**BUILT 2026-09-03 — this BRANCHES unit, as the FIRST unit built (`b420e80`). The
advisor re-sequenced it ahead of the permission model above:
branches re-key `doc_no_counters` and touch every operational table at a cost that
grows with every table and every real row, while permissions cost the same whenever
done; doing permissions first would have meant sweeping the new permission tables
again for `branch_id`. Nothing here is renumbered — "Unit 1" above stays the
permission model and is still to be briefed.** Landed as migration `0018_branches.py`
with `server/app/branches.py`, `bills.py`, `master.py` (`GET /shop`), `reports.py`,
`reconcile.py` (T8/T9 per `(branch, year)`, new T17/T18), `provision_shop.py`,
`seed_dev.py`, `server/scripts/prove_branches.py` and mobile `prove:branch`. What
this unit DID from the spec above: `branches`, the born-with branch per tenant
(`MAIN`, the shop's own name, prefix `B`) in the migration and in
`provision_shop.py`, `branch_id NOT NULL` on `purchase_bills` and `doc_no_counters`
with the re-keyed primary key and `doc_prefix`, `users.branch_id`, the phone's
`local_shop.branch_id` with the bill payload carrying it, T8 widened, X1 widened,
`GET /shop` returning the caller's branch. What it did NOT and why: `branches.all`
and the 403 across branches are permission work, deferred to the permission model
by the brief's explicit fence (no handler gained a permission check; branch scope
is enforced by nothing but the composite FK); `product_prices.branch_id` deferred
with prices per this unit's own "must not touch". Two things section 9 left open
were closed by the builder and confirmed by the owner: `UNIQUE (tenant_id,
doc_prefix)` and `CHECK (doc_prefix ~ '^[A-Z]{1,4}$')` — the reasons are at the
site in 0018. One thing the brief re-derived for money's sake: `branch_id` is
OPTIONAL on the wire and the server resolves it, because a bill queued offline
before 0018 carries none and a required field would refuse it terminally with the
cash already paid (0018's docstring holds the chain). Proven: `B-2569-1` … `C-2569-1`
on a scratch, every one of 630 `(id, doc_no)` pairs unchanged value against value,
Shop A's counter 617 → 617 with the next bill 618, `reconcile.py` exit 0 on live
and on a restored copy. Record: `PROJECT_STATUS.md § Current phase`.

If the owner declines branches, unit 2 is the generic outbox store: `local_outbox`, `SqliteOutboxStore`, a builder for generic handlers, proven with a synthetic kind in the harness over claim, recovery, the owner predicate and the halt disposition, with the existing three kinds untouched and the `new SyncEngine` site count unchanged when the synthetic kind is added. Its disproof: removing the claim's conditional WHERE lets two passes perform one row.

**Unit 3: the money ledger, schema and degenerate path only.** Builds batch B's tables with `separate_cashier` defaulting false on `branches`, `POST /bills` writing the automatic payment and allocation in its transaction, the dev-only backfill marked `recorded_by_migration`, `GET /bills/{id}` returning `paid_amount` and derived status, `GET /payments` and `POST /payments` under `payments.record` with 424 for an unknown bill, reconcile P1 through P4 and the line arithmetic with `rounding_adjustment`, `prove_backup_restore` round-tripping the new tables. No counter screen, no phone change beyond a schema-tolerant read. It proves: every bill created with the switch off has exactly one payment and one allocation equal to its total, read from Postgres; with the switch flipped on a scratch, a created bill has zero allocations and appears in the unpaid query, and flipping it back leaves that bill unpaid; every pre-existing bill reads `paid` with its backfilled pair marked; `reconcile.py` exit 0 on live and on a restored copy, with each of P1 through P4 fired by an injection in `prove_reconcile.py` that names its row and clears on undo. It must not touch: `local_bills`, any screen, the outbox. Size: one migration, `bills.py`, one new `payments.py`, `reconcile.py`, three proofs. The disproof: a bill in a switch-off tenant whose allocations do not sum to its total, or the P2 injection staying green with the check present.

**BUILT 2026-09-05 — this MONEY LEDGER unit, the THIRD built (unanchored; anchor next
pass), migration `0020_payments.py`. What it did from the spec above: `payments` and
`payment_allocations` as section 2.1 sketches them plus `branch_id` per section 9;
`branches.separate_cashier` (the first declared counter policy of 1.2, DEFAULT false,
written by no route — PATCH /branches is section 9's second-yard work); `POST /bills`
writing the automatic cash payment and its allocation inside the bill's transaction
(`bills._record_automatic_payment`), from the server's own values and nothing on the
wire, so a bill queued on a phone before the ledger existed drains paid and a replay
writes no second pair (the automatic key `auto:<bill id>` is UNIQUE per tenant, the
structural backstop behind the idempotency short-circuit); the dev-only backfill, 619
pairs marked `recorded_by_migration` (one per live positive-total bill; a voided or
zero-total bill gets none); `GET /bills/{id}` and the bill list returning `paid_amount`
and `payment_status` (unpaid / partial / paid, derived at every read, stored nowhere)
with `GET /bills?unpaid=true` as the cashier queue; `POST /payments` and `GET /payments`
under `payments.record`, the FOURTEENTH catalogue code, minted here and granted to
owner and admin (staff weighs; the cashier is a role a shop creates), with 424
`bill_unknown` for a bill still in a device's queue and 422 for a voided bill, a seller
mismatch, an over-allocation or a duplicated bill; `reconcile.py` P1–P4 with six T10
arms and four X1 pairs; `prove_reconcile.py` five new injections (P1–P4 and the
payment-side T10/X1/P3 cross-tenant one) beside two older injections that now ALSO
trip P2 and P3, which is the checker working; `prove_backup_restore` round-tripping
both tables with no edit, its lists being catalogue-derived; NEW
`scripts/prove_payments.py`; NO phone change at all — the phone reads only `doc_no` off
a bill response, so the two new keys moved nothing on any handset.
**FIVE DEPARTURES FROM THE TEXT ABOVE, each the owner's decision of 2026-09-05, with
its reason at the site in 0020:** the two tables are NOT audited (the brief asked for
the trigger; section 2 is silent; 0017 excludes the transactional ledger by design and
auditing them would have conscripted `POST /bills`, which declares no actor);
`paid_by` is NULLABLE under `CHECK (paid_by IS NOT NULL OR recorded_by_migration)`
because 71 live dev bills predate `created_by` and inventing a payer would be
`fallback-default-is-a-wrong-number` beside real money; `shift_id` is OMITTED until
`shifts` exists (the 0019 precedent: no column nothing reads) and is filed as owed;
section 2.3's line rewrite and `rounding_adjustment`, which this unit's paragraph names
under "the line arithmetic", are the unit AFTER this one and T1/T2 stand unchanged;
and the bill LIST rows carry the two derived keys too, because a queue whose rows do
not say what is outstanding is not a queue. **ONE CORRECTION TO SECTION 2.5 ABOVE:**
the 424-versus-422 line it draws for an unknown bill is now the route docstring in
`app/payments.py`, and the same reasoning puts a VOIDED bill, a seller mismatch and an
over-allocation on the 422 side — facts about the payload against the ledger as it
stands, whose repair is a reissued payment. Record: `PROJECT_STATUS.md § Current
phase`. The readers of `total_amount` that gain a second question the day a route
flips the switch are listed at `OPEN_ITEMS.md § Code debt found and left in place`
as a CONDITION the counter unit invalidates.**

**Unit 4 (unnumbered here; section 12 named the first three): THE CASHIER COUNTER,
server commit — BUILT 2026-09-06 (unanchored; anchor next pass).** The unit the
owner has asked for since QR payment first came up, whose boundary the build
re-drew: not server-versus-screen but THE SWITCH AND EVERY FIGURE THE SWITCH MAKES
FALSE. **What the tree forced as corrections to the brief, and to this document's
own picture of what unit 3 left:** most of the counter's server surface ALREADY
SHIPPED at `0020` and the advisor briefed a unit half of which existed — the cashier
QUEUE is `GET /bills?unpaid=true` (`bills.py`), and the many-to-many payment
(`POST /payments`, an allocation list) settles several bills in one payment, a
deposit-then-rest, or an advance with no bill; all were built and proven at `0020`.
And `packages/` is NOT empty — `@recycle/shop-time` is the pure-shared-TS precedent
(so PromptPay in `packages/` is a pattern, not scaffolding). **What this commit
BUILT:** `PATCH /branches/{id}` (`app/master.py`), the minimal one-column writer of
`separate_cashier` 0020 shipped without, gated on `shop.settings.write` (NOT a new
`branches.manage` — a permission no route checks means nothing, 0019; section 9
mints and re-gates its own), audited, no migration; the deferred-reader condition
above WORKED THROUGH and re-filed at `OPEN_ITEMS.md`; `GET /sellers/{id}/history`
now carries `paid_amount`/`payment_status` per bill (money-gated), rendered as a
settlement badge; the dashboard hero relabelled off a cash claim onto its true
price basis. **Proven:** `prove_payments.py` gained W (the switch WRITER over HTTP:
staff 403, unknown branch 404, admin flips it and a bill goes unpaid, the flip in
`audit_log`) and MB (ONE PAYMENT ACROSS TWO DISTINCT BILLS, the gap 0020 left, read
back out of Postgres); `prove_seller_history.py` asserts the settlement keys under
the money gate; the mobile `proveSellerHistory`/`proveDashboard` cover the display.
**DEFERRED to commit 2 (the SCREEN) or beyond, each recorded:** PromptPay QR (a
`packages/` pure function beside the screen that renders it, per 2.4, its
known-vector proof with it); `payments.void` and a client of `POST /payments`; the
phone's offline `cached_shop_policy` read (1.4). Record: `PROJECT_STATUS.md §
Current phase`.

**Unit 4, commit 2 — THE CASHIER SCREEN — BUILT 2026-09-08 (unanchored; anchor next
pass), NO migration.** The split the owner took (S6): this commit is the QUEUE + the
PAYMENT FORM + PAYING (cash/transfer); PromptPay QR is commit 3, quarantined so its
real-bank verification uncertainty never mixes into the commit that claims paying is
proven, and `payments.void` stays deferred (a correction workflow, not part of
finishing a payment). **Built.** Server: `GET /shop/policy` (`app/master.py`), the
READ sibling of `PATCH /branches/{id}` and the way the phone learns `separate_cashier`
WITHOUT widening `branch_payload`'s five keys (the owner's ruling 1) — a dedicated
policy endpoint, the shape every future switch is added to. Phone: `cached_shop_policy`
+ `SqliteShopPolicyStore` (display-only, fails OPEN, tenant-stamped; refreshed beside
the branch, read on boot), `src/counter/counterView.ts` (the pure model — queue parse
and grouping by seller oldest-wait-first, the payment-form arithmetic refusing P1/P2/
duplicate/over-amount BEFORE the request in DECIMAL, refusal wording from `(status,
code)`, `mayShowCounterEntry` with the fail-open reasoning AT THE SITE per ruling 2,
the labels), `subtractMoney`/`compareMoney` added to `money.ts`, `app/CounterScreen.tsx`
(queue → inline pay panel), the `counter` sheet, the `รับชำระเงิน` nav entry,
`payments.record` in the phone's `Permission` union and the proof grants. ONLINE-ONLY
(ruling 3): `POST /payments` reconciles against the live ledger under a lock, which no
stale cache can do, so an unreachable read is a calm amber message and the queue
refreshes on return; an offline payment kind is a future outbox kind at the measured
per-kind cost (2.5), not built. **Proven:** `prove:counter` (NEW) GREEN twice, headless
(61 cells: the gate both ways, the queue derivation, the P1/P2/dup arithmetic each with
a presence sibling, every refusal negatively over its render with a no-leak scan, the
labels) AND a LIVE round against a real server (flip the switch on, read `GET
/shop/policy`, create two bills, watch them arrive UNPAID, pay BOTH in ONE payment,
watch them leave, drive 424/422/403, restore the switch). `prove:all` GREEN
(`PROVE_ALL_EXIT=0`, RED 0), native gate quoted at the STOP. **A pre-existing red fixed
out of fence on the owner's instruction:** `prove_payments` G4 was RED at `cfd7136` and
recorded green — a presence scan of `GET /payments`' newest-first window that a mature
live-dev database (no ledger paging) had already pushed every reconstruction out of;
repaired to assert the `recorded_by_migration` flag on a RECORD the endpoint can return,
the TRUE side left to B2/B3 over Postgres. The ledger's missing paging and the
three-instance "reported-green-that-reddens" pattern are filed at `OPEN_ITEMS.md`.
**Shown:** on the emulator with `separate_cashier` ON for Shop A — a bill created from
the yard side arrived unpaid in the queue (`ค้างจ่าย`, grouped under `สมชาย ใจดี`), the
pay panel showed `ยอดที่จะจ่าย` before committing, and on `ยืนยันจ่าย` the bills left
(`ไม่มีบิลค้างจ่าย`), the queue refreshing to the next. **Deferred, recorded:** PromptPay
(commit 3); `payments.void`; the queue's "how long waited" badge (the model carries
`waitingSince`; the screen does not yet render a duration). Record: `PROJECT_STATUS.md §
Current phase`.

**Unit 4, commit 3 — THE PromptPay QR PAYLOAD — BUILT 2026-09-10 (unanchored; anchor next pass), NO migration, NO screen, NO server.** The split the owner took (S6): commit 3 is the `packages/` pure function and its proof, quarantined so its real-bank verification uncertainty never mixes into commit 2's claim that paying is proven. **ONE CORRECTION TO § 2.4 ABOVE:** that paragraph names the payee identifier as `seller_bank_accounts.promptpay_id`, and that table DOES NOT EXIST — batch D is unbuilt, and the tree at HEAD holds only `sellers` and `seller_code_reservations` (re-derived from `information_schema`, 2026-09-10). The payee proxy AVAILABLE today is the seller's PHONE — `sellers.phone` exists at HEAD (`text`, nullable) and is cached in `cached_sellers`; `id_number` is deliberately not cached on the device (a security narrowing, `mobile/app/api.ts`). So this commit builds a MOBILE-NUMBER payload, and 2.4's `promptpay_id` source arrives with batch D. **Built.** `@recycle/promptpay` (`packages/promptpay/`), a mirror of `@recycle/shop-time` (built to `dist/`, consumed as the built package, resolved through the `node_modules/@recycle` workspace link — the pure-shared-TS pattern, not scaffolding), holding one pure function `promptPayPhonePayload`: a Thai mobile number and the ledger's quantized amount STRING in, an EMVCo/PromptPay TLV payload with CRC-16/CCITT-FALSE in place OR a typed refusal out. Pure — no clock, network, I/O, device API or randomness. The amount is embedded verbatim (no float, hard rule 1); a separator is refused, not stripped; four distinct refusal codes each carrying no payload fragment; the payee resolved or refused, never defaulted (a default payee is a default identity). `mobile/package.json` gained `prove:promptpay` and its `build:shared` now builds the new package. **Proven.** `prove:promptpay` GREEN twice (55 headless cells, `PROVE_PROMPTPAY_EXIT=0`, pure so no reseed): the CRC algorithm against its published check value (`0x29B1` over `"123456789"`, CRC RevEng catalogue) via an INDEPENDENT CRC; a structural round trip via an INDEPENDENT parser (lengths match, fully consumed, CRC recomputes) with a corrupted-length control naming the fault position; the payee proxy asserted VALUE-by-VALUE against a spec-derived expectation; every refusal by code with a controlled no-leak scan; the four-digit amount with no separator. Three manual disproofs each reddened EXACTLY the named cell(s), restored byte-identical; the broken-proxy disproof left the CRC cell GREEN, which is the whole point (`lessons/a-self-consistent-payload-is-not-a-correct-one.md`). Both typechecks exit 0; `prove:all` reported at the STOP. **NOT VERIFIED against a real bank:** the CRC ALGORITHM is verified against its published check value; the payload FORMAT is DERIVED from the EMVCo / Bank of Thailand QR standard and is SELF-CONSISTENT, not confirmed against a bank-issued vector — the owner scanning a sample is the last layer, from HIS number, not a seed row's. **Deferred, recorded:** wiring to the payment form (`counterView.ts`, `CounterScreen.tsx`); `seller_bank_accounts.promptpay_id` (batch D); slip verification; `payments.void`. Record: `PROJECT_STATUS.md § Current phase`.

**Unit 5, commit 1 — THE SHIFTS AND CASH-DRAWER SCHEMA — BUILT 2026-09-12 (unanchored; anchor next pass), migration `0021_shifts_and_cash.py`, NO route, NO screen, NO client code.** The irreversible half of the shifts unit (batch B of § 11), split out on the counter unit's own precedent (schema is commit 1, routes commit 2). **Built:** four tables from § 2.4 / § 1.6 — `shifts` (open/close, with the close columns all-NULL-or-all-present and AT MOST ONE OPEN shift per branch enforced by the partial unique index `uq_shifts_one_open_per_branch`, in the schema not a route), `cash_movements` (the payments species: `amount > 0`, one idempotency key per tenant, voided never deleted), `branch_payment_methods` (PK `(tenant_id, branch_id, method)`, born with one `cash` row per branch, `method` CHECKed against the SAME set as `payments.method`), `shop_payment_channels` (the owner's own-channels gap of 2026-09-11, per tenant, nullable branch, coherent-for-its-kind); and two columns — `branches.shifts_enabled boolean NOT NULL DEFAULT false` (the declared switch) and `payments.shift_id uuid NULL` composite-FK to `shifts` (the column 0020 filed as owed, nothing writes it here). RLS+FORCE+policy on all four; grants `SELECT, INSERT, UPDATE` with DELETE revoked (nothing here is ever deleted); a downgrade that REFUSES past the born-with state (a shift, a cash movement, a non-cash method, a channel, or a `shifts_enabled` branch — each a named count, the 0015/0018/0020 shape); self-measuring read-backs (one cash row per branch, all pristine, and the two method sets read EQUAL out of `pg_constraint`, not restated on both sides). **THE AUDIT DECISION — the owner's 2026-09-18 SPLIT (commit 1 first audited only the two config tables; T8 had said all four):** `shifts`, `branch_payment_methods` and `shop_payment_channels` carry the 0017 trigger; `cash_movements` ALONE does NOT. `shifts` is audited although transactional because it is the only new table UPDATED IN PLACE on money columns (`counted_cash`, `expected_cash`, `variance`) and its writers always carry a principal, so 0020's "conscripts POST /bills, which declares no actor" reason does NOT transfer; it transfers COMPLETELY to `cash_movements` (insert-plus-void, the payments species). Invariant 14 is a FLOOR (master-data tables must be audited), not a ceiling. `reconcile.py` gained the four tables (TENANT_TABLES, SCOPE_SQL/COLUMN, X2) and the three audited tables — `shifts` and the two config tables — (AUDITED_TABLES/S6) in this same commit — its S2/S6 red on the new tables was observed then cleared, the checker working. **DECISIONS at the site:** the close CHECK covers FIVE columns (the four § 2.4 names plus `variance`, because a closed shift with a null variance is a hole hard rule 6 forbids); `variance_reason` is separately nullable (a reason for a non-zero variance is a close-route policy, § 3.5, commit 2); `cash_movements.shift_id` is nullable (a shifts-off shop or a pre-materialise movement has no shift); `receipt_file_id` carries NO FK (files is batch C). **Proven:** NEW `scripts/prove_shifts.py`, 59 cells GREEN TWICE with `PROVE_SHIFTS_EXIT=0` (in the GREEN bucket, its own verdict line), every negative cell with a positive sibling; 14 `--break` disproofs each reddened EXACTLY the cell(s) testing the dropped object and no other (including `audit_shifts` → the shifts-audited cell and `audit_cm_add` → the cash-not-audited cell); the upgrade/downgrade/upgrade round trip and the refusal (a real shift present makes the downgrade REFUSE, read as an error) on a scratch; `reconcile.py` exit 0 on live and on a restored copy; `prove_all` reported at `PROJECT_STATUS.md § Current phase`. **Deferred, recorded at `OPEN_ITEMS.md`:** every route (commit 2); `expected_cash`'s computation and freezing; the born-with cash row for a branch created AFTER this migration (server code, `provision_shop.py`, commit 2); the offline kinds and the generic `local_outbox` store; the late-arrival policy (the owner's, unsettled while `user_devices` is unbuilt); `receipt_file_id`'s FK (batch C); `payments.verification_status` (slip verification); `approvals` and its threshold columns; and the § 3.5-vs-§ 1.6 collision on `roles.payment_limit` (per shift AND per bill vs one column).

Two observations before the advisor turns these into briefs. The bill-line rewrite in 2.3 is in batch B and not in unit 3 on purpose: unit 3 is the ledger, and the line's new columns land with the containers and pricing-basis feature that pulls them, per S17, in the unit after. And the whole of this document is UNMEASURED as to whether a real yard wants any of it; what is measured is that the structure holds the shop that uses everything and costs the shop that uses nothing one automatic row per bill, which is the owner's principle written as a schema.
