# Recycle Online — architecture audit (read-only)

Audit date: 2026-08-13. Repository state: HEAD `5957042`, clean tracked tree
(three untracked files outside scope: ARGUS_MOBILE_READ.md, COMMIT_MSG.txt,
UNCOMMITTED_DOCS.diff). Scope: `server/`, `mobile/`, `tools/`, `desktop/`;
`.claude/` and root markdown excluded except where a finding's evidence
required them (proof red-record search, OPEN_ITEMS rot check).

**Method.** One inline inventory pass (git ls-files + byte/LF counts), then an
8-agent survey (2 file mappers, 6 task agents), then verification. The two
adversarial verifier agents failed twice on infrastructure (login expiry, then
session limit), so **verification was performed inline by the coordinating
session instead**: every band-A and band-B finding was re-measured against its
cited file and line — 4 rounds of direct reads and greps, ~45 distinct
measurements. **All 37 A/B findings were CONFIRMED at their cited lines**; one
detail adjusted (noted inline). Band-C findings carry the surveyor's
measurement and were NOT independently re-verified except where a C finding
shared evidence with a verified A/B finding (noted where so). Nothing was
edited; every command was a read.

**A caveat the harness attached:** the proof-coverage survey agent ran without
its safety-classifier review. Its output was therefore checked more heavily
than the others — its central negative claims (route census, "exercised by
nothing" list) were re-derived by independent greps during verification, and
its red-record claims name their search words so they can be re-run.

---

## The shape of what exists (Task 1)

Instrument: `git ls-files` over the four roots; bytes from stat; lines = LF
count in raw bytes. Tracked files only.

| area | files | lines | bytes | of which |
|---|---|---|---|---|
| mobile/ | 102 | 44,551 | 2,283,306 | proofs 18,364 lines (41%); lockfile 8,194; assets ~2,192 |
| server/ | 58 | 19,787 | 1,138,373 | scripts/ 12,206 lines (62%, mostly proofs); app/ 4,644 |
| tools/ | 2 | 874 | 39,419 | paste-set builder + citation checker |
| desktop/ | 1 | 0 | 0 | `.gitkeep` only — **confirmed empty by ls and git ls-files** |
| **total** | **163** | **65,212** | **3,461,098** | |

Subtracting generated files (two lockfiles, 9,174 lines) and binary assets,
the hand-written total is ~53,800 lines, and its single most important
property: **the proof harness is bigger than the product.** Server product
code (`app/` + migrations + init SQL) is ~6,400 lines against ~12,000 lines of
scripts; mobile product code (src minus proof, plus app/ and App.tsx) is
~16,000 lines against 18,364 lines of proofs. The third architecture
component, desktop, is one empty placeholder — every claim in this report is
about a two-client system in practice.

Files large enough that nobody reads them fully (>750 lines, product code
only): `mobile/App.tsx` 1,906; `server/scripts/reconcile.py` 1,371;
`SqliteLocalStore.ts` 1,058; `server/app/users.py` 964;
`mobile/src/reports/dailyView.ts` 964; `server/app/master.py` 889;
`mobile/app/CartScreen.tsx` 792; `mobile/src/sync/engine.ts` 756. Three of the
eight (App.tsx, users.py, engine.ts) are where this audit's highest-band
findings live.

The full per-file map (163 one-line purposes, from full or head reads of every
file) is Appendix A.

## Proof coverage, reconciled (Task 3)

The brief said fourteen proof scripts. **The measured census is 41 entry
points**: 17 `server/scripts/prove_*.py` (ls) + 24 `prove:*` scripts in
`mobile/package.json` (read). The three groups:

**Group 1 — proofs with a written record of going red** (search: proof name
within 2 lines of `reddened|went red|goes red|turned red|was red|exit 1|
refuted|FAILED|caught`, over PROJECT_STATUS.md, OPEN_ITEMS.md, lessons/*.md):
server — prove_master_write, prove_reconcile, prove_bills, prove_rls,
prove_shop_code (red twice, plus a false green caught), prove_revocation,
prove_user_create, prove_backup_restore; mobile — proveSignOut, proveCart,
proveNotice, proveForbidden, proveDraftOwner. 13 of 41.

**Group 2 — exercised, no red record found with those words**: the eight
remaining server proofs (prove_auth's one incident is a discarded piped run,
not a red) and the nineteen remaining mobile proofs. Not "never red" — "no red
found with these words," which is the exact phrasing the search warrants.

**Group 3 — exercised by NOTHING** — the deliverable. The server API surface
is NOT in it: all 37 registered routes are invoked by at least one proof
(route census by grep of `@router`/`@app` registrations; every path string
grepped over server/scripts). All six SyncEngine public operations are driven.
What remains uncovered concentrates in exactly three places, all
band-B-listed below with mechanisms: (1) **the mobile UI wiring layer** —
App.tsx and all 15 files under mobile/app/ are imported by zero proofs and
compiled by neither typecheck program's proof half; the session-end guard
re-check and both sessionEnded appliers can be deleted with all 41 proofs
green; (2) **the device adapters** (`src/device/`: the real SQLite driver and
the keychain store) — excluded from the node program, imported by zero proofs;
(3) **provision_shop.py** — the script that writes a real shop's permanent
rows is run by no proof (prose citations only), guarded on its one real run by
a manual argv-hex measurement. Plus one seam named by a proof itself:
be_year under a genuinely wrong Postgres clock is covered in no direction
(prove_year_gate.py:16-20 says so verbatim), and HttpTransport's 401 branch is
driven by a real HTTP 401 in none of the 41 (proveSignOut:1257 attributes it
to proveSync; proveSync contains zero HttpTransport references — verified by
grep).

## What the verification pass added

Beyond confirming all 37 A/B findings, four things surfaced during inline
verification that sharpen the survey:

1. The two A-band findings **compound**: a bill marked synced with doc_no null
   (finding A2) then shows the void progress line "รอส่งบิลเข้าระบบก่อน แล้วจะ
   ยกเลิกให้อัตโนมัติ" (parkedReason.ts:577 branches on `doc_no === null`
   before the promise branch) — a promise of automatic action on a row the
   void queue can never select. The screen actively asserts the opposite of
   the truth, which is the exact defect class (screen contradicting the state
   behind it) RED_TEAM.md hunts first.
2. The claimed zero-import negatives for the proof layer are real: every
   grep match for `device/`, `app/`, `App.tsx` over mobile/src/proof is
   docstring prose, several stating "App.tsx is unreachable from here."
3. OPEN_ITEMS.md already records the App.tsx wiring gap — at line numbers
   (611/617/658) that have rotted to 767/779/822 while the claim stayed true.
   The queue entry is findable but its anchors mislead, the exact rot the
   repo's pin-to-a-commit convention names.
4. users.py's route-order trap (finding B12) is guarded by a comment that is
   itself correct and load-bearing — the kind of comment the stale-comment
   findings (B: T6) show cannot be assumed correct elsewhere. The audit found
   both: comments that are the only guard, and comments that are wrong.

---

# Findings, by risk band

Band definitions as briefed. Every finding names file:line, what makes it
true, and how it was measured; A/B findings additionally carry the inline
verification verdict. Task tags: T2 duplication, T3 proof coverage,
T4 permanent writes, T5 tacit knowledge, T6 stale comments, T7 asymmetries.

## Band A — a wrong result or lost money is possible today (2 findings, both verified)

### [A | T2] mobile/src/sync/parkedReason.ts:40

**Claim.** MASTER_DATA_CODES lists only ["seller_grade_unset","product_price_unset"], but the server today emits FOUR master_data_missing (424) codes — bills.py also raises "seller_inactive" (bills.py:344) and "product_inactive" (bills.py:392) — so the two lists disagree right now, and the comment at parkedReason.ts:39 ("The codes the server currently emits") is false.

**Mechanism.** Reachable with no code change: the office retires a seller/product while a device holds a queued bill; the 424 parks the bill with master_data_code='seller_inactive'; isKnown() misses, so parkedReason falls to the unknown branch (parkedReason.ts:261-266) whose sentence tells the office to set a PRICE or a GRADE — the wrong instruction, since the fix is one reactivate click (bills.py:66). Same wrong sentence reaches the status strip via parkedSummary (parkedReason.ts:638-644). What notices: only the designed degradation itself — billNotice appends the raw code ("รหัส: seller_inactive", parkedReason.ts:473-475); proveSeller S7 proves the fallback fires, not that the list is complete; no proof or type ties the TS list to bills.py.

**Measured by.** Read parkedReason.ts 34-267 and bills.py 74-406; Grep 'seller_inactive|product_inactive' over mobile/ returned zero matches

**Also involved:** `server/app/bills.py:344`; `server/app/bills.py:392`; `mobile/src/sync/parkedReason.ts:261`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [A | T4] mobile/src/adapters/httpTransport.ts:125

**Claim.** A 201/200 whose response body fails to parse yields doc_no null, which markSynced writes permanently into the local row; a later void of that bill is then stranded forever because listVoidsToApply requires doc_no IS NOT NULL, so the server keeps holding money the owner has cancelled.

**Mechanism.** httpTransport.sendBill swallows a response.json() failure (lines 119-125) and returns {kind:'accepted'|'duplicate', doc_no:null}; engine.ts:636 passes it to markSynced (SqliteLocalStore.ts:658-674), which sets sync_state='synced', doc_no=NULL — a terminal local state nothing revisits: no code re-fetches doc_no after sync. If the owner later requests a void, listVoidsToApply's predicate (SqliteLocalStore.ts:939) `sync_state='synced' AND doc_no IS NOT NULL` never selects the row, so the void is never sent, never refused, never retried; the diagnostic comment at SqliteLocalStore.ts:894-922 enumerates exactly two causes for a void missing from this queue (ownership, permanent refusal) and this third cause is not among them. Trigger is real today: a connection dropped after the status line but before the body completes on the one successful send. No validation stands before the markSynced write — the null is accepted by design ('null means unknown') and there is no repair path.

**Measured by.** Read mobile/src/adapters/httpTransport.ts (lines 119-128, 218), mobile/src/sync/engine.ts (631-645), mobile/src/adapters/sqlite/SqliteLocalStore.ts (658-674, 924-945); grep confirmed no other writer of local doc_no and no DELETE FROM local_bills anywhere in mobile/src.

**Also involved:** `mobile/src/sync/engine.ts:636`; `mobile/src/adapters/sqlite/SqliteLocalStore.ts:666`; `mobile/src/adapters/sqlite/SqliteLocalStore.ts:939`; `mobile/src/adapters/sqlite/SqliteLocalStore.ts:894`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.


## Band B — traps that fire when someone changes something nearby (35 findings, all verified)

### [B | T2] mobile/src/adapters/httpTransport.ts:127

**Claim.** The status-code contract is a duplicated table: the server's refusals (201/200 create, 422 permanent, 424 resolvable, 401 auth.py, 403 require_admin, 409+404 void, 409 year-gate) vs the client mapping in sendBill (httpTransport.ts:127-166) and voidBill (httpTransport.ts:220-242), plus separate copies for the daily report (dailyView.ts:712-794) and login (signInIdentity.ts:52-54, the single 401 definition).

**Mechanism.** Any refusal status the server adds that the client table lacks falls into the sendBill catch-all {kind:'unavailable', reachable:true} (httpTransport.ts:159-166) → infinite head-of-line retry feeding the poison counter to the red 'call support' alarm — exactly the failure the 403 entry (httpTransport.ts:25-34) records happening when the void gate landed server-side before the client learned 403. This exists today for 409 year_gate_refused on create (bills.py:503): unmapped, so it retries forever as reachable-unavailable. Nothing automated compares the two tables; the classification-survives-unparseable-body rule (status, never prose) is the only structural protection.

**Measured by.** Read httpTransport.ts (whole), bills.py 282-625, dailyView.ts 707-794, signInIdentity.ts 44-54

**Also involved:** `server/app/bills.py:503`; `server/app/bills.py:74`; `mobile/src/reports/dailyView.ts:712`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T2] mobile/src/adapters/sqlite/SqliteLocalStore.ts:418

**Claim.** The send-queue ordering 'ORDER BY device_created_at, created_at, id' is written out four times in one file (lines 418, 430, 609, 827) and mirrored again by the in-memory fake the proofs run against (fakes.ts:180-196); the engine blocks on the head of one query while the UI's blocker banner reads the head from another.

**Mechanism.** types.ts:614-619 states the must-agree: pendingQueueSnapshot is 'keyed on the SAME ordering the engine blocks on, so the bill the UI marks as the blocker is the bill actually blocking'. Divergence between any two copies makes the strip name a different bill than the one damming the queue — no error anywhere, just a wrong diagnosis on the screen. A drifting fake instead makes the proofs green over an ordering the device does not run. Only the proofs driving both real store and fake would notice, and only for the copies they exercise; listReadyToSend (line 410-423) has NO production caller (its own comment, lines 393-399), so its copy is proof-only evidence.

**Measured by.** Read SqliteLocalStore.ts 370-435 and 590-614; Grep ORDER BY occurrences; Read types.ts 610-624

**Also involved:** `mobile/src/adapters/sqlite/SqliteLocalStore.ts:430`; `mobile/src/adapters/sqlite/SqliteLocalStore.ts:609`; `mobile/src/adapters/sqlite/SqliteLocalStore.ts:827`; `mobile/src/proof/fakes.ts:190`

**Verification.** CONFIRMED, one detail adjusted: fakes.ts mirrors the ordering in its JS comparator logic, not as a literal SQL string (the four literal copies are all in SqliteLocalStore.ts: 418, 430, 609, 827).

### [B | T2] mobile/src/money/money.ts:33

**Claim.** The NUMERIC scale/sign bounds exist in three layers that must match: DB numeric(14,3)/(14,2) with CHECK >= 0 (migration 0001:170,206,254-259), pydantic Field(ge=0, max_digits=14, decimal_places=3/2) (bills.py:178-181, master.py:97), and mobile WEIGHT_DP=3/MONEY_DP=2/WEIGHT_MAX_INT_DIGITS=11/MONEY_MAX_INT_DIGITS=12 (money.ts:33-46), which the numpad also enforces (entry.ts:165-192).

**Mechanism.** Widening a DB column without touching money.ts gives a keypad that silently refuses values the server would accept (the drift money.ts:38-44 names). Loosening pydantic without the DB reopens the documented silent-rounding path: Postgres ROUNDS an over-scale value instead of rejecting (bills.py:158-169, verified against the live DB), then ck_items_net fails as an unhandled 500 → 'unavailable' → permanent head-of-line queue jam. What notices: the server 422 for mobile-side drift (loud, at the yard's cost); nothing automated ties the three layers together.

**Measured by.** Read money.ts 29-100, bills.py 155-184, entry.ts 147-192; Grep 'numeric(14' over migrations

**Also involved:** `server/migrations/versions/0001_initial_schema.py:254`; `server/app/bills.py:178`; `server/app/master.py:97`; `mobile/src/cart/entry.ts:165`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T2] mobile/src/money/money.ts:91

**Claim.** net = gross − tare is enforced in three places: computed exactly on mobile (netWeight, money.ts:91-95), validated per line on the server (bills.py:295), and enforced by ck_items_net in the DB (migration 0001:267).

**Mechanism.** Today the three agree by construction (mobile computes what the other two check). The trap: a change letting any layer accept a net the others refuse — e.g. tolerating a negative net on mobile, which money.ts refuses but the server only checks for equality after ge=0 fields — makes bills the client happily saves into terminal 422s (visible, after cash paid); a server-side relaxation without the DB CHECK produces the 500/queue-jam path instead. Reconcile does not re-derive this identity (the DB CHECK is its guarantee, listed in REQUIRED_CONSTRAINTS reconcile.py:304-307).

**Measured by.** Read money.ts 86-95, bills.py 293-300, migration 0001 grep, reconcile.py 299-317

**Also involved:** `server/app/bills.py:295`; `server/migrations/versions/0001_initial_schema.py:267`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T2] mobile/src/money/money.ts:98

**Claim.** The line-amount formula amount = round_half_up(net × unit_price, 2dp) exists in four independent implementations that must agree digit-for-digit: mobile decimal.js lineAmount (money.ts:98) with round-then-sum in cart.ts cartTotal (cart.ts:336), server Python Decimal _line_amount (bills.py:151) summed at bills.py:301, Postgres round(net*list,2) in the daily report's off-list SQL (reports.py:323), and Postgres round() again in reconcile.py check T2.

**Mechanism.** Mobile↔server drift is noticed loudly but at the yard's expense: the server rejects a mismatched client total (bills.py:303) with a terminal 422, so every bill landing on a half-satang boundary becomes sync_state='failed' AFTER cash was paid (money.ts:11-17 documents HALF_EVEN would differ by one satang on 10.003×15.00). Server↔SQL drift (off_list_variance) has NO check: Postgres round(numeric) is half-away-from-zero, equal to ROUND_HALF_UP only because every value is non-negative by CHECK — reconcile.py:82-87 states this and re-verifies stored rows, but only when someone runs it. Mobile rounding also hangs on a process-global Decimal.set at money.ts:31.

**Measured by.** Read money.ts (whole), cart.ts 327-338, bills.py 151-152/288-307, reports.py 318-334, reconcile.py 60-96 and 404-409

**Also involved:** `server/app/bills.py:151`; `server/app/reports.py:323`; `mobile/src/cart/cart.ts:336`; `server/scripts/reconcile.py:405`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T2] mobile/src/sync/parkedReason.ts:577

**Claim.** The void path's promises and its work-queue predicate are two copies of one rule: voidProgressLine's 'อัตโนมัติ' sentences (parkedReason.ts:558-579) promise automatic application exactly where listVoidsToApply's SQL predicate (void_requested_at set, voided_at null, void_refused_at null, sync_state='synced', doc_no not null, requester matches — SqliteLocalStore.ts:924-940) will actually pick the row up.

**Mechanism.** The 2c-7 defect this file documents was precisely these copies disagreeing: a card promising an automatic void for a terminally failed bill that listVoidsToApply can never return (parkedReason.ts:535-556), and later one card carrying two opposite claims when billNotice learned the refusal and voidProgressLine did not. Any new exclusion added to the SQL (the owner filter was the latest — the header at SqliteLocalStore.ts:141-155 warns it) needs a matching sentence, or the card promises work the engine will never do while cash-relevant reversals sit unapplied. What notices: proveNotice/proveVoidTerminal enumerate the sentence states, but nothing ties them to the SQL predicate mechanically.

**Measured by.** Read parkedReason.ts 521-627, SqliteLocalStore.ts 141-155 and 924-940, types.ts 626-666

**Also involved:** `mobile/src/adapters/sqlite/SqliteLocalStore.ts:936`; `mobile/src/sync/types.ts:637`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T2] mobile/src/sync/types.ts:15

**Claim.** The sync-state vocabulary 'pending'/'syncing'/'synced'/'failed' exists as a TS union (types.ts:15), as a CHECK constraint baked into the SQLite CREATE TABLE (schema.ts:111), and as ~21 string literals inside SqliteLocalStore's SQL.

**Mechanism.** The CHECK is frozen into every deployed handset's table: SQLite cannot alter a CHECK without rebuilding the table over the shop's unsynced bills — types.ts:117-123 records this as the reason 'parked' had to be a nullable column instead of a fifth state. A new state added to the TS union therefore fails at runtime, on upgraded devices only, when the first UPDATE writes it — putBill/markX throws and the failure surfaces per operation, not at build. TS narrowing keeps the union and the store literals honest at compile time on fresh code; nothing checks them against the CHECK already on devices.

**Measured by.** Read types.ts 1-60 and 110-130; Grep state literals over schema.ts (line 111) and count over SqliteLocalStore.ts (21 hits)

**Also involved:** `mobile/src/adapters/sqlite/schema.ts:111`; `mobile/src/adapters/sqlite/SqliteLocalStore.ts:371`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T2] mobile/src/sync/types.ts:29

**Claim.** The POST /bills wire contract is typed twice with nothing cross-checking: BillPayload/BillItemPayload (types.ts:17-37) vs pydantic BillCreate/BillItemIn (bills.py:155-198). One asymmetry already exists by design: the mobile item type REQUIRES list_price and sends it; the server deliberately does not accept it and stamps its own (bills.py:182-184).

**Mechanism.** No shared schema, no codegen, no contract test: httpTransport.ts:41 itself records "NOT VERIFIED against the running server". Server-side prove_bills.py builds its payloads independently in Python, so it proves the server's contract, never the mobile copy. A field the server starts requiring (or renames) turns every queued bill into a 422 → terminal 'failed' after cash was paid; a field mobile adds is silently ignored by pydantic. The distinct outcome classes ride on status codes, which survive body drift — field-name drift does not.

**Measured by.** Read types.ts 1-60, bills.py 155-198, httpTransport.ts 1-120, createBill.ts (whole)

**Also involved:** `server/app/bills.py:155`; `server/app/bills.py:187`; `mobile/src/adapters/httpTransport.ts:41`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T2] mobile/src/time/shopTime.ts:70

**Claim.** The Buddhist-era offset (543) and the shop timezone (UTC+7 / "Asia/Bangkok") are each defined twice, once per side: BE_YEAR_OFFSET (shopTime.ts:70) vs _BE_OFFSET (bills.py:120), and SHOP_UTC_OFFSET_MINUTES/SHOP_TIMEZONE_NAME (shopTime.ts:55-58) vs config.SHOP_TIMEZONE (config.py:36-37) — copies of a convention with no automated cross-side comparison.

**Mechanism.** Divergence reproduces the measured precedent shopTime.ts:61-68 records: a bill card showing a Gregorian or off-by-543 date beside a doc_no whose year came from the server, and around midnight/new-year a screen filing a bill in a different shop day than the server's daily total. What notices today: only a human — dailyView.ts:796-811 deliberately renders the day label from the CLIENT authority so the screen is the one place the two derivations meet; proveTime (mobile) and prove_shop_time.py/prove_docno_clock.py (server) each test their own side only. Both files carry per-tenant/DST revisit notes (shopTime.ts:24-36, config.py:23-34).

**Measured by.** Read shopTime.ts (whole), config.py 11-37, bills.py 120-148, dailyView.ts 796-811; Grep '543' across server/mobile/tools

**Also involved:** `server/app/bills.py:120`; `server/app/config.py:37`; `mobile/src/reports/dailyView.ts:811`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T2] server/app/bills.py:535

**Claim.** The doc_no format "B-{be_year}-{seq}" is built inline with no helper, and is restated by every consumer: parsed by split_part(...,'-',2/3)::int in the daily-report SQL (reports.py:290-291), restated as DOC_NO_RE in reconcile.py:286 (documented as a restatement, not an independent check), and mirrored by regexes in proveTime.ts:91, prove_shop_time.py:170, prove_bills.py:147.

**Mechanism.** A format change (prefix, zero-padding, extra dash) leaves the writer and its parsers disagreeing: reports.py's ::int cast raises on a non-numeric split_part, turning GET /reports/daily into a 500 for the owner; reconcile T6 and the prove scripts go red only when run. Zero-padding specifically is called out at reconcile.py:283-284 as producing two different strings for one number that the partial unique index would not stop. Mobile production code never parses doc_no (renders verbatim), so the phone is immune.

**Measured by.** Grep '"B-|B-\{' across server/mobile/tools; Read reports.py 272-313, reconcile.py 280-287, proveTime.ts 86-94

**Also involved:** `server/app/reports.py:290`; `server/scripts/reconcile.py:286`; `mobile/src/proof/proveTime.ts:91`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T3] mobile/App.tsx:1

**Claim.** GROUP (3): the whole UI wiring layer — App.tsx plus the 15 files in mobile/app/ (CartScreen, BillsPanel, StatusStrip, SignOutSheet, LoginScreen, DailyScreen, SellerPicker, dialogs, api.ts, config.ts, messages.ts, ids.ts, Numpad, MasterDataStrip) — is executed by no proof.

**Mechanism.** The proofs deliberately cover the pure functions behind the screens (dailyView, statusNotice, parkedReason, signOutNotice, freshness, entry, sellers); no proof imports anything from mobile/app/ or App.tsx, and tsconfig.node cannot compile them. Hard rule 8's 'failure must be visible, never silent' is enforced exactly in this unproven layer: a wiring slip that drops a notice or binds the wrong counter breaks visibility while every proof and both typechecks stay green.

**Measured by.** Glob mobile/app/**; Grep proof imports (no ../app or App.tsx references); Read App.tsx:570-664

**Also involved:** `mobile/app/StatusStrip.tsx:1`; `mobile/app/SignOutSheet.tsx:1`; `mobile/app/BillsPanel.tsx:1`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T3] mobile/App.tsx:767

**Claim.** GROUP (3): the second maySync guard — re-checked AFTER `await engine.runOnce()` (line 737) — is exercised by nothing; deleting line 767 leaves all 41 proofs green and both typecheck programs at exit 0.

**Mechanism.** tsconfig.node.json (include: src, exclude: src/device, rootDir: src) means no node proof can compile App.tsx; proveSignOut S4b asserts the maySync PREDICATE (signOut.ts:108), never this call site. A silent break here lets a sign-out that lands mid-sync-pass write session state onto a screen that already says signed out — stale takings/role under the next user. OPEN_ITEMS.md:642-662 records this exact gap ('delete line 611 and prove:signout stays green'), against now-stale line numbers.

**Measured by.** Grep maySync/sessionEndedAfterPass over App.tsx (hits at 735, 737, 767, 779, 822); Read tsconfig.node.json in full; Read OPEN_ITEMS.md:640-679

**Also involved:** `mobile/src/session/signOut.ts:108`; `mobile/tsconfig.node.json:34`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T3] mobile/App.tsx:779

**Claim.** GROUP (3): the two call sites that APPLY the session decision — `setSessionEnded((was) => sessionEndedAfterPass(was, r))` at :779 and :822 — are asserted by nothing; delete either and prove:signout stays green, typecheck:app stays 0.

**Mechanism.** proveSignOut S9 drives sessionEndedAfterPass itself from a real 401 pass and a real outage pass (seven cells go red if its sessionExpired arm is broken), but the WIRING lives in App.tsx, outside the node proof program. Silent break cost: a real 401 pass never sets sessionEnded, the login screen is never shown, and the queue sits stuck under the exact 'expired session displayed as ออฟไลน์' defect class this system already paid for once (engine.ts:62-69 comment).

**Measured by.** Grep over App.tsx; Read OPEN_ITEMS.md:663-679; Read engine.ts:38-100

**Also involved:** `mobile/App.tsx:822`; `mobile/src/session/signOut.ts:167`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T3] mobile/src/adapters/httpTransport.ts:132

**Claim.** GROUP (3): HttpTransport's 401 → session_expired branch (sendBill :132-136, voidBill :225-226) is driven by a REAL HTTP 401 in none of the 41 entry points.

**Mechanism.** proveForbidden F6 drives the real HttpTransport against the real API but only for 403 (sendBill :815, voidBill :829/:875 — Thai reason strings); proveSignOut:1257 states 'HttpTransport's own 401 -> session_expired mapping (proveSync owns it)' but proveSync contains zero HttpTransport imports — its 401 cases run ExpiredSessionTransport fakes; proveLoginScreen's null-token transport (:459-462) is used only for resumeAfterSignIn, which touches no network; proveCold drives the transport against a closed port (transport-error branch). So engine classification of session_expired is proven, the server's 401s are proven server-side (prove_auth), and the seam between them — the real status-code read — is proven by nothing: lessons/two-green-proofs-do-not-cover-the-seam shape on the exact path whose misclassification previously showed an expired session as offline.

**Measured by.** Grep HttpTransport/session_expired/401 over mobile/src/proof and httpTransport.ts; Read proveLoginScreen.ts:430-527, proveSignOut.ts:1245-1274, proveForbidden grep hits

**Also involved:** `mobile/src/adapters/httpTransport.ts:225`; `mobile/src/proof/proveForbidden.ts:815`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T3] mobile/tsconfig.node.json:35

**Claim.** GROUP (3): mobile/src/device/ (expoSqliteDriver.ts, secureTokenStore.ts) is excluded from the node proof program and imported by zero proof files — the production storage and keychain adapters are exercised by none of the 41 entry points.

**Mechanism.** 'exclude': ['src/device'] because it imports expo-sqlite/React Native globals; every proof runs NodeSqliteDriver/MemoryTokenStore instead. A break in the device adapters (wrong pragma, keychain clear failure, driver mutex behavior) is invisible to the entire suite and both typecheck programs the proofs share; only a manual handset pass can see it. PROJECT_STATUS records device passes covering some of this (not re-verified here — a report, not a source).

**Measured by.** Read tsconfig.node.json in full; Glob mobile/src/device; Grep '../device/' over mobile/src/proof (0 hits)

**Also involved:** `mobile/src/device/expoSqliteDriver.ts:67`; `mobile/src/device/secureTokenStore.ts:63`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T3] server/scripts/prove_year_gate.py:17

**Claim.** GROUP (3), named by the proof itself: no proof covers be_year derivation under a genuinely wrong POSTGRES clock — 'which nothing covers for the Postgres direction' (its own docstring).

**Mechanism.** Both clock proofs mutate the OTHER side of the comparison (watermark rows, counter rows) because the container clock cannot be moved without moving dev's; prove_docno_clock covers the Python-clock direction only. If the guard or _be_year read the wrong clock source, every cell in prove_clock_guard and prove_year_gate would still pass (stated at prove_clock_guard.py:20-24). Cost when it fires: wrong-year doc_no series and a counter row for a year that has not happened — permanent under hard rule 5.

**Measured by.** Read prove_year_gate.py:1-60, prove_clock_guard.py:1-60, prove_docno_clock.py:1-145

**Also involved:** `server/scripts/prove_clock_guard.py:20`; `server/app/bills.py:282`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T3] server/scripts/provision_shop.py:1

**Claim.** GROUP (3): provision_shop.py — the script that creates a real shop's tenant and users — is exercised by no proof; grep over server/scripts finds it only in prose (prove_user_create.py:10,279,370 cite its ARGUMENTS, never run it).

**Mechanism.** It writes rows for which no delete path exists anywhere in the system ('users.py: NOTHING HERE DELETES ANYTHING'); a silent break lands permanently wrong rows in a database a new shop depends on. The pilot run was guarded by a MANUAL pre-write argv hex measurement (CLAUDE.md workflow entry, 2026-08-10), which is an operator discipline, not a proof — the next person who edits this file has no red to trip.

**Measured by.** Grep provision_shop|reset_clock_watermark over server/scripts (reset_clock_watermark IS exercised — prove_clock_guard.py:291 runs it as a subprocess; provision_shop has no such caller)

**Also involved:** `server/scripts/prove_user_create.py:10`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T4] server/app/bills.py:535

**Claim.** The doc_no written at bills.py:535-542 is a permanent legal-sequence value derived from the server clock, and the year gate guarding it has three stated blind spots: a clock jump of exactly +1 year, a tenant's first-ever counter, and a forward-wrong clock on a fresh install — a tenant onboarded under a wrong clock takes a wrong first be_year permanently.

**Mechanism.** be_year comes from the transaction's own now() (bills.py:427-428). The year gate (bills.py:471-513) refuses only a NEW (tenant_id, be_year) that is not max+1; bills.py:441-446 states +1 is indistinguishable from a real new year, and bills.py:447-453 states a tenant's first counter is allowed unguarded by construction. clock_guard.py catches only BACKWARD movement past a 24h tolerance against a watermark (clock_guard.py:44, 130-149) and its own docstring (lines 11-15) states it cannot see a forward-wrong clock from a fresh install or a watermark seeded from an already-wrong clock. All guards run on the real path (middleware at main.py:186 refuses every non-/health request when should_refuse; the year gate is inline in create_bill), plus prove_docno_clock.py/prove_year_gate.py as proofs on top — but the residual blind spots mean a wrong be_year in doc_no (which the counter then keys) is writable today under a wrong-forward clock at onboarding, and 'a gap in a legal document sequence cannot be repaired afterwards' (bills.py:434-435).

**Measured by.** Read server/app/bills.py (408-535), server/app/clock_guard.py (whole file), server/migrations/versions/0002 (doc_no_counters DDL), grep of main.py for should_refuse (middleware at main.py:186, lifespan evaluate at main.py:66).

**Also involved:** `server/app/bills.py:447`; `server/app/bills.py:441`; `server/app/clock_guard.py:11`; `server/app/main.py:186`; `server/migrations/versions/0002_bills_docno_and_vehicle.py:39`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T4] server/scripts/backup_db.py:631

**Claim.** The backup's silent-empty verification is bounded to schema public: directory.shop_codes rows are dumped and counted into the manifest but never compared against live counts, so a backup missing the shop-code rows (the map from printed slips to tenants) would ship verified.

**Mechanism.** `tables` comes from public_tables() (backup_db.py:256-266, `nspname = 'public'`); the missing-COPY-block check (629-630) and the silent-empty check (631-636) iterate only over `tables`, and live_row_counts (269-284) hardcodes the `public.` qualifier. pg_dump is run with no --schema flag (603-607) so directory.shop_codes IS captured today and lands in the manifest via copy_header_key (477-490) — but if any future condition produced an absent or empty shop_codes block (a --schema flag, a grant change), no check would go red at backup time. restore_db.py's comparison (443-499) walks the manifest's own keys, so an absent key on the backup side is invisible there too — its CANNOT_SEE block (170-176) states it cannot see what the dump did not name. The false-failure predicted by 0009's docstring section (b) has been fixed (restore_db.py:434-442 walks manifest keys only), so this is the remaining asymmetry, not that one.

**Measured by.** Read server/scripts/backup_db.py in full (256-284, 496-529, 603-645) and server/scripts/restore_db.py in full (434-499); grep for 'directory|shop_codes' in restore_db.py.

**Also involved:** `server/scripts/backup_db.py:256`; `server/scripts/backup_db.py:629`; `server/scripts/restore_db.py:443`; `server/migrations/versions/0009_directory_shop_codes.py:103`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T4] server/scripts/provision_shop.py:340

**Claim.** The shop-code INSERT is the system's most explicitly immutable write (the code goes onto printed slips), and the value is validated before the write by DB constraints on the real path — but immutability itself is enforced by nothing: no trigger, no revoked UPDATE for the owner role, only a COMMENT ON COLUMN.

**Mechanism.** Before the INSERT at provision_shop.py:337-344: the code's alphabet and length are parsed OUT OF ck_shop_code itself with no fallback (code_shape_from_constraint, lines 108-147), the live database refuses without an explicit flag (173-180), an existing code refuses re-issue (312-331), and the DB enforces ck_shop_code `^[A-HJKMNP-Z2-9]{8}$` (0009:389), uq_shop_code (0009:388) and the tenant_id PK (0009:386) — all on the only path that exists (the installer script IS the real path; no endpoint can write this table, measured in the script's docstring lines 8-16). What is unguarded: migration 0009's docstring (lines 20-31) and _CODE_COMMENT (0009:326-335) state that nothing in the database enforces immutability — an UPDATE run as recycle_owner rewrites an already-printed code silently, making two shops share an identifier across time. Only downgrade() refuses once codes exist (0009:411-445).

**Measured by.** Read server/scripts/provision_shop.py (whole file) and server/migrations/versions/0009_directory_shop_codes.py (whole file); grep found no UPDATE path to directory.shop_codes anywhere in server/.

**Also involved:** `server/migrations/versions/0009_directory_shop_codes.py:389`; `server/migrations/versions/0009_directory_shop_codes.py:20`; `server/migrations/versions/0009_directory_shop_codes.py:326`; `server/scripts/provision_shop.py:312`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T4] server/scripts/restore_db.py:377

**Claim.** DROP DATABASE IF EXISTS <target> WITH (FORCE) destroys whatever --into names, and the overwrite gate protects only the database the backup came FROM — any other existing database in the cluster is dropped with no flag, while line 304 prints 'live data untouched'.

**Mechanism.** The gate at restore_db.py:293-297 fires only when target == source_db AND the target exists. A --into naming any OTHER existing database (a second shop's db, a typo'd name) passes straight to the DROP at line 376-377 with FORCE (which kills active connections), and the preceding print at line 304 asserts the source 'live data untouched' — true of the source, silent about the database being destroyed. Today the deployment is a single docker cluster with one app database, so this fires when a second database appears near this script — the classic B shape.

**Measured by.** Read server/scripts/restore_db.py in full (gate at 281-304, DROP at 376-377).

**Also involved:** `server/scripts/restore_db.py:293`; `server/scripts/restore_db.py:304`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T5/T6-mobile] E:\recycle-online\mobile\App.tsx:433

**Claim.** The identityStoreRef comment says 'Written by signIn below and by nothing else. Nothing READS it yet — the owner columns exist and are left NULL (P1.7 stamps them next pass)' — all three clauses are false at this commit: the store is read on every owned write, and the owner columns are written and filtered on.

**Mechanism.** currentOwner (App.tsx:939-941) reads the identity store via ownerForNewRow on every draft save (954), cart open (1310) and bill promotion (1424); SqliteLocalStore's BILL_INSERT_SQL writes owner_tenant_id/owner_user_id (213-215, 260-261); the QUEUED predicate and unsentBreakdown filter every send-queue and count query by that owner (163-164, 783-797). A reader trusting 'left NULL / nothing reads it' would treat the owner filter as dead code and could remove or bypass the identity read on a new write path, producing unowned rows that the design deliberately parks forever (unknownOwner). P1.7 landed — the same file says 'Owner-filtered since P1.7 step 7' at line 395.

**Measured by.** Read App.tsx 428-437 (the comment), 914-941 (currentOwner), 954/1310/1424 (owner-stamped writes); rowOwner.ts:71-74; SqliteLocalStore.ts 163-164, 205-215, 232-263, 772-806.

**Also involved:** `E:\recycle-online\mobile\App.tsx:940`; `E:\recycle-online\mobile\src\adapters\sqlite\SqliteLocalStore.ts:214`; `E:\recycle-online\mobile\src\session\rowOwner.ts:71`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T5/T6-mobile] E:\recycle-online\mobile\App.tsx:696

**Claim.** The 30-bill display cap (`setBills(all.slice(0, 30))`) silently doubles as the retention horizon of the seller-picker's plate index: platesBySeller is built from `bills`, so a vehicle plate last used 31 bills ago stops being searchable, and shrinking the card-list cap shrinks the picker's plate memory with it.

**Mechanism.** platesBySeller (App.tsx:278-287) is a useMemo over `bills`, which is the sliced list; the comment on it says only 'built from our OWN bills' and '`bills` is already sorted newest-first' with no mention of the cap. The 30 was chosen for the bill-card panel; nothing marks it as load-bearing for the picker search. voidsRefusedCount at 703 deliberately counts over `all` for exactly this reason ('Counted over EVERY bill, not over the 30 shown'), which shows the cap's reach was considered for one consumer and not the other.

**Measured by.** Read App.tsx 271-287 (platesBySeller and its comment), 693-703 (slice and the contrasting voidsRefusedCount comment), 1755-1766 (SellerPicker fed platesBySeller).

**Also involved:** `E:\recycle-online\mobile\App.tsx:278`; `E:\recycle-online\mobile\App.tsx:698`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T5/T6-mobile] E:\recycle-online\mobile\App.tsx:1209

**Claim.** onSignOut's useCallback dependency array is `[failedCount, pendingCount]`, but the callback reads `ownUnsentCount` (line 1171) and never reads `pendingCount` — the value the sign-out refusal gate actually depends on is missing from the deps.

**Mechanism.** The memoized callback captures ownUnsentCount at creation and is only recreated when failedCount or pendingCount change. ownUnsentCount = mine + mineBlocked while pendingCount = mine, so the two can move independently: e.g. one engine pass releases a master-data-parked bill and syncs it (mine unchanged net, mineBlocked -1), leaving the callback holding a stale ownUnsentCount. Today the reachable direction is stale-HIGH (sign-out refused over bills that no longer exist, and the refusal does not self-heal because nothing recreates the callback); the stale-ZERO direction that would permit a sign-out over a real unsent bill is not constructible from current transitions, but any new writer of master_data_missing_at or the owner columns makes it reachable. The comment at 1167-1170 explicitly says the gate was moved to ownUnsentCount (P1.7); the deps array still describes the old wiring.

**Measured by.** Read App.tsx 1163-1209 (callback body uses ownUnsentCount at 1171, deps at 1209); refresh() at 679-683 shows setPendingCount(unsent.mine) and setOwnUnsentCount(unsent.mine + unsent.mineBlocked); SqliteLocalStore.unsentBreakdown at 772-806 confirms mine/mineBlocked are disjoint counts.

**Also involved:** `E:\recycle-online\mobile\App.tsx:1171`; `E:\recycle-online\mobile\App.tsx:683`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T5/T6-mobile] E:\recycle-online\mobile\src\sync\queueHealth.ts:106

**Claim.** MAX_ATTEMPT_CYCLE_MS = 60_000 hard-encodes two constants that live in other files — HttpTransport's default 20s timeout and App.tsx's backoffMaxMs = 30000 — and no mechanical guard ties them together, while the one guard that does exist (SyncEngine's constructor throw) explicitly invites raising backoffMaxMs to anything under 15 minutes.

**Mechanism.** poisonObserved (line 294) is `rawPoisonMs <= serverErrorAttempts * MAX_ATTEMPT_CYCLE_MS`, and only poisonObserved arms the clock trigger of the red poison alarm (line 314-317). If backoffMaxMs is raised past ~40s — which clockSanity.ts:79-83 advertises as safe ('leaves room for a knob to be raised') and the engine's constructor guard (engine.ts:168-180) accepts up to 900000ms — a normal attempt cycle exceeds 60s, rawPoisonMs outruns accountedForMs in ordinary operation, poisonObserved goes false, and the time-based alarm silently never fires; only the 5-attempt count trigger remains. Nothing goes red at the change site.

**Measured by.** Read queueHealth.ts 79-106 (comment naming '20s timeout' and '30s in App.tsx') and 283-317; httpTransport.ts:84 (timeoutMs ?? 20_000); App.tsx:583 (backoffMaxMs: 30000, no timeoutMs passed); engine.ts:168-180 (guard checks only SEND_SCHEDULE_HORIZON_MS); clockSanity.ts:74-86.

**Also involved:** `E:\recycle-online\mobile\App.tsx:583`; `E:\recycle-online\mobile\src\adapters\httpTransport.ts:84`; `E:\recycle-online\mobile\src\sync\engine.ts:172`; `E:\recycle-online\mobile\src\time\clockSanity.ts:86`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T5/T6-server] server/app/reports.py:290

**Claim.** _SUMMARY_SQL casts split_part(doc_no,'-',2) and (,3) to int; any stored doc_no with a non-numeric middle or tail part (e.g. 'B-abc-7') makes the cast raise and the whole daily report answer 500 for that day

**Mechanism.** NULLIF(...,'') only defuses an EMPTY part; a non-empty non-numeric part hits ::int, Postgres raises 22P02, the query aborts, and the owner's closing-time screen gets an unhandled 500. The unstated assumption is that create_bill is the only writer of doc_no (T5/T6 in reconcile.py check the shape, but only when someone runs reconcile). The doc_no shape B-<year>-<seq> is now restated in three places — bills.py:535 f-string, reconcile.py:286 DOC_NO_RE (which names itself a restatement), and this SQL, which does not

**Measured by.** Read reports.py:287-313 and traced NULLIF/split_part/::int semantics; read bills.py:535 and reconcile.py:281-286

**Also involved:** `server/app/bills.py:535`; `server/scripts/reconcile.py:286`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T5/T6-server] server/app/reports.py:323

**Claim.** _OFF_LIST_SQL's round(net_weight * list_price, 2) agrees with bills._line_amount's Decimal ROUND_HALF_UP only because every operand is non-negative by CHECK; a future signed line (discount, adjustment) makes the two silently diverge on ties

**Mechanism.** Postgres numeric round() is half-AWAY-FROM-ZERO; Python ROUND_HALF_UP is also away-from-zero — identical for non-negative values, different framing that coincides only there. reports.py:87 says 'the same HALF-UP-per-line arithmetic bills._line_amount uses' WITHOUT stating the non-negativity condition; the condition is written down only in reconcile.py:82-87 ('every value here is non-negative by CHECK, so the two must agree'). A reader relaxing a CHECK (ge=0) for an adjustment feature has no warning at either SQL site

**Measured by.** Read reports.py:75-91 and 318-334, bills.py:151-152, reconcile.py:82-96, and migration 0001's CHECK constraints (amount/price/weight >= 0)

**Also involved:** `server/scripts/reconcile.py:84`; `server/app/bills.py:152`; `server/migrations/versions/0001_initial_schema.py:254`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T5/T6-server] server/app/seeddata.py:64

**Claim.** FE-STEEL grade-B price 15.00 and SELLER_A_ID's grade B are load-bearing test constants: 15.00 makes the amount for gross 10.005 / tare 0.002 land exactly on the HALF_UP-vs-HALF_EVEN rounding tie (150.045), and prove_master_data_gate.py borrows and restores SELLER_A_ID's grade specifically

**Mechanism.** An innocent edit — rounding the seed price to a rounder number, or regrading the demo seller — leaves every proof green while silently removing the only default-price path that reaches the rounding edge, and breaks prove_master_data_gate's borrow/restore assumption. The comments (lines 39-44 and 58-64) say so, but the values look like arbitrary fixture data to anyone editing seeddata without reading them

**Measured by.** Read seeddata.py:38-72 in full; comments at 43-44 and 62-64 name both dependencies

**Also involved:** `server/app/seeddata.py:44`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T5/T6-server] server/app/users.py:805

**Claim.** POST /users/me/password must stay registered before POST /users/{user_id}/password; an innocent reorder (alphabetising, splitting the module, moving the admin route up) silently re-routes 'me' to the admin handler

**Mechanism.** Starlette matches routes in registration order and {user_id} has no path converter, so it matches the literal segment 'me'; the request then reaches reset_user_password and is answered 422 (malformed uuid) or 403 (staff caller entitled to the self route). Neither response looks like a routing fault. The guard is only a comment at lines 799-804 plus route order — nothing structural enforces it

**Measured by.** Read users.py:799-964; confirmed /users/{user_id}/password takes user_id: uuid.UUID with no converter in the path string and is registered at line 901, after line 805

**Also involved:** `server/app/users.py:901`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T5/T6-server] tools/verify_citations.ps1:69

**Claim.** The default -Source list is only START_HERE.md and ARCHITECTURE.md; run bare, every other citing document (ROADMAP.md, OPEN_ITEMS.md, PROJECT_STATUS.md, SRS_MAP.md ...) is never opened while the run prints healthy CITATIONS/BROKEN totals and exits 0

**Mechanism.** The checker parses citations out of the files it is GIVEN; a document absent from $Source contributes nothing and no control can notice, because the non-empty and section controls are per-source. This is the exact fail-by-measuring-less shape the script's own header (lines 25-36) documents from its first hardcoded-source hole, and CLAUDE.md's footgun section separately records the default list as stale. The default is a policy decision (which docs are checked) encoded in a parameter default

**Measured by.** Read verify_citations.ps1 in full; default at line 69, per-source controls at lines 161-176; CLAUDE.md machine-footguns entry on -Source binding and the stale default list

**Also involved:** `tools/verify_citations.ps1:35`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T7] mobile/App.tsx:543

**Claim.** Failure classification on the master-data refresh is binary (401 = session expired, everything else = offline) while the equivalent-in-role bill transport is five-way: an answered 5xx or 403 on GET /products sets online=false, the exact answered-vs-unreachable conflation the send path's `reachable` flag exists to prevent.

**Mechanism.** refreshMaster catches per-request errors and branches only on isUnauthorized (401); any HttpStatusError with another status lands in `failed` and drives setOnline(false). On the send path a server-answered non-2xx yields `unavailable, reachable: true` (or a distinct kind), feeding the poison signal. No reachability evidence exists on the master path, so a server answering errors renders as a network outage on the strip.

**Measured by.** Read of App.tsx:496-549, api.ts:47-75 (HttpStatusError, isUnauthorized checks 401 only), httpTransport.ts:127-166

**Also involved:** `mobile/src/adapters/httpTransport.ts:159`; `mobile/app/api.ts:63`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T7] mobile/app/api.ts:67

**Claim.** The master-data fetch path (getJson for /products and /sellers) has no timeout, while every sibling request path does (sendBill/voidBill 20s via AbortController, fetchDailyReport 20s) — and it sits behind a single-flight latch that silently drops later refreshes while one is in flight.

**Mechanism.** getJson calls fetch with no AbortController. refreshMaster sets refreshingRef.current=true and clears it only in finally; if the un-timed fetch never settles, the latch stays held and every subsequent refresh trigger (picker open, cart start, sign-in) returns at App.tsx:498 with no signal — the cache age simply grows on the strip while the refresh path is wedged. api.ts:181-189 documents adding a timeout for the daily report 'unlike the master-data reads above'.

**Measured by.** Read of api.ts:67-75 and 186-201, httpTransport.ts:96-97/192-194, App.tsx:448-455 and 496-549

**Also involved:** `mobile/App.tsx:498`; `mobile/app/api.ts:188`; `mobile/src/adapters/httpTransport.ts:97`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T7] mobile/src/sync/queueHealth.ts:215

**Claim.** The offline-vs-poisoned classification and the red alarm exist for the bill-send queue only: assessQueue reads snap.head (the pending send head) and pendingCount; the void queue has no reachability stamp (no first_server_error_at analog) and is never assessed.

**Mechanism.** A void whose attempts keep meeting 5xx (transport classifies as `unavailable`, engine calls markVoidAttemptFailed) stays owed and is retried every 4s pass forever, with void_attempts/void_last_error recorded but nothing distinguishing an answered refusal from a dead network and no escalation. The only void counter App surfaces is voidsRefusedCount (App.tsx:703), which counts terminal refusals, not retryables — so a permanently-bouncing void, i.e. money the yard believes cancelled and the server still holds live, has no alarm equivalent to the send head's.

**Measured by.** Read of queueHealth.ts (whole file: only snap.head/pendingCount/masterDataBlockedCount consumed), engine.ts:546-549, SqliteLocalStore.ts grep (void columns carry attempts/last_error only), App.tsx:697-703

**Also involved:** `mobile/src/sync/engine.ts:546`; `mobile/App.tsx:703`; `mobile/src/adapters/sqlite/SqliteLocalStore.ts:1035`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T7] server/app/bills.py:672

**Claim.** Unexpected-DB-error logging exists on one purchase_bills write path and not the other: create_bill wraps its transaction in IntegrityError/SQLAlchemyError handlers that emit the greppable BILL_POISON_CANDIDATE line; void_bill has no exception handling and no log line at all.

**Mechanism.** The log exists because a 500 is `unavailable` to the mobile client and retries. A void meeting an unexpected DB error takes the identical retry shape — and the client void queue retries with NO backoff (SqliteLocalStore.listVoidsToApply has no time gate) — yet produces no server-side diagnostic. The blast radius the docstring names for create (unbounded retry) is present on void with less server-side visibility, not more.

**Measured by.** Read of server/app/bills.py:90-118 (_log_poison_candidate), 586-625 (both except arms on create), 672-704 (void_bill, no try/except)

**Also involved:** `server/app/bills.py:90`; `mobile/src/adapters/sqlite/SqliteLocalStore.ts:936`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.

### [B | T7] server/app/bills.py:696

**Claim.** The two write paths on purchase_bills handle a concurrent-duplicate race asymmetrically: create_bill detects and converges a lost race (IntegrityError -> re-SELECT by idempotency_key, counter-row lock serializes writers), while void_bill is an unlocked check-then-act whose UPDATE has no `AND voided_at IS NULL` predicate.

**Mechanism.** void_bill SELECTs voided_at (no FOR UPDATE, READ COMMITTED), then UPDATEs WHERE id only. Two concurrent voids whose SELECTs both precede the first commit both pass the 409 check; the second UPDATE waits on the row lock, re-evaluates its id-only predicate after commit, and overwrites voided_at/voided_by/void_reason — the first void's audit metadata is silently replaced and both callers get 200. The create path's equivalent race is caught (bills.py:586-616) and answered with the existing bill.

**Measured by.** Read of server/app/bills.py:282-625 (create path incl. counter lock at 519-534 and IntegrityError recovery at 586-619) and 672-704 (void path)

**Also involved:** `server/app/bills.py:586`; `server/app/bills.py:519`; `server/app/bills.py:684`

**Verification.** CONFIRMED at the cited lines by inline re-measurement, 2026-08-13.


## Band C — everything else recorded (48 findings, surveyor-measured, not independently re-verified)

### [C | T2] mobile/app/api.ts:15

**Claim.** The master-data wire shape is held in three TS copies — api.ts Product/Seller (15-32), master/types.ts MasterProduct/MasterSeller (15-32, the cache shape), cart/sellers.ts SellerOption (27-33) — plus the server's dict literals in master.py (~499-518 products, 821 sellers); the TS copies deliberately avoid importing each other because app/ is unreachable by the headless proofs.

**Mechanism.** The TS↔TS copies are held together structurally by the compiler at assignment sites. The server↔client edge is not: getJson is a cast, not a check (api.ts:67-75, `as T`), so a renamed server field arrives as undefined typed as string — e.g. a renamed `prices` makes gradePrice return null for every product, blanking price defaults (visible, and fail-safe by the no-invented-price rule at sellers.ts:42-48) rather than producing a wrong number. The grade vocabulary A–D lives only server-side (master.py:95 Literal + DB CHECK); mobile treats grade as an opaque string key, so that vocabulary cannot drift on the client.

**Measured by.** Read api.ts 1-152, master/types.ts (whole), sellers.ts 22-48; Grep payload keys in master.py

**Also involved:** `mobile/src/master/types.ts:15`; `mobile/src/cart/sellers.ts:27`; `server/app/master.py:514`

### [C | T2] mobile/src/session/signInIdentity.ts:172

**Claim.** The login wire contract is typed on both sides: LoginRequest/LoginResponse (main.py:32-44, response built at main.py:294 with access_token and user_id) vs the client's body literals in api.ts login (139-145) and the readString("access_token")/readString("user_id") pair (signInIdentity.ts:172-173).

**Mechanism.** Drift fails visible and closed: a missing/renamed token field returns {kind:'server_fault', detail:'no_token'} instead of a phantom session — the exact defect (a 200 with no token entering a signed-in state via `as`-cast) this module replaced, per api.ts:95-101. The empty-string-counts-as-absent rule (signInIdentity.ts:121-133) closes the 'Bearer ' variant. 401's meaning has exactly one client definition (isUnauthorizedStatus), which api.ts imports rather than restating.

**Measured by.** Read signInIdentity.ts (whole), api.ts 34-151; Grep login/LoginResponse over server/app (main.py:32-44, 294)

**Also involved:** `server/app/main.py:294`; `mobile/app/api.ts:139`

### [C | T2] server/app/reports.py:215

**Claim.** The refusal envelope {kind, code, message, ...context} under FastAPI's `detail` is hand-built in at least four server places — reports._invalid (215-220, its own comment: 'Same shape as master._invalid'), master.py's helpers, bills._master_data_missing (77-87), and auth.py's 403 (~345) — while the client depends only on detail.code being where refusalCode/fetchDailyReport look for it (httpTransport.ts:69-73, api.ts:212-219).

**Mechanism.** A fifth copy putting `code` at a different nesting silently lands every refusal on the client's fallback code ('forbidden'/'master_data_missing'), degrading wording but never classification — the class rides on the status by design. Nothing enforces the envelope; the agreement is convention plus the comment naming it.

**Measured by.** Read reports.py 215-220, bills.py 77-87, httpTransport.ts 59-73, api.ts 203-220; Grep admin_required in auth.py (line 345)

**Also involved:** `server/app/bills.py:77`; `mobile/src/adapters/httpTransport.ts:69`; `mobile/app/api.ts:213`

### [C | T2] server/app/reports.py:510

**Claim.** The literal "server_received_at" is a deliberate shared-string tripwire: the server sends it as basis.aggregated_on (reports.py:510) and the client compares it (dailyView.ts:839-842), refusing to print the day-boundary sentence as fact and showing basisWarning if it ever reads anything else. Likewise the daily-report response shape is re-typed and hand-validated field-by-field in readDailyBody (dailyView.ts:199-349) against reports.py's dict (494-612).

**Mechanism.** This pair is the one cross-side duplication with a built-in notice: drift degrades to a visible calm warning (or the 'cannot read' screen for a missing headline field, with readMoney refusing JSON numbers outright), never to a wrong number. The cost of the duplication is bounded by construction: fatal fields kill the screen, bad rows are dropped and COUNTED (unreadable_rows), totals come from SQL aggregates independent of the list.

**Measured by.** Read reports.py 494-612 and dailyView.ts 90-349, 830-842

**Also involved:** `mobile/src/reports/dailyView.ts:840`; `mobile/src/reports/dailyView.ts:197`

### [C | T3] OPEN_ITEMS.md:653

**Claim.** OPEN_ITEMS' record of the App.tsx uncovered-wiring gap cites lines 611, 617 and 658; the current file has those calls at 767, 779 and 822 — the queue entry's line anchors have rotted while its claim is still true.

**Mechanism.** App.tsx grew; OPEN_ITEMS pins raw line numbers with no commit anchor, the exact rot CLAUDE.md's 'PIN A CLAIM TO A COMMIT' convention names. A reader checking :611 today finds setSellersFetchedAt and could dismiss the entry as fixed.

**Measured by.** Read OPEN_ITEMS.md:640-679 and App.tsx:570-664; Grep maySync/sessionEndedAfterPass over App.tsx (hits 735/767/779/822)

**Also involved:** `mobile/App.tsx:767`

### [C | T3] PROJECT_STATUS.md:2811

**Claim.** GROUP (1) — proofs with a RECORD of having gone red (words searched: the proof's name within 2 lines of reddened|went red|goes red|turned red|was red|exit 1|refuted|FAILED|caught, over PROJECT_STATUS.md, OPEN_ITEMS.md, lessons/*.md): prove_master_write (PS:2811 'went red', assertion not code, 2026-07-29); prove_reconcile (PS:3672 & :3715 'exit 1, 113 [OK]/4 [FAIL]'; OPEN_ITEMS:449-451); prove_bills (PS:3380 'case 1 still went red' under mutation; lessons/a-mutation-on-a-protected-write-path:9-10); prove_rls (PS:2928 injected RuntimeError, teardown observed); prove_shop_code (PS:4742 'SEEN RED, TWICE', both exit 1, plus the :4749 false-green found and closed); prove_revocation (lessons/all-lessons.md:806 'exit 1, exactly two cells fired' under mutation B); prove_user_create (lessons/all-lessons.md:2575 P6 measured the 422 password echo, 2026-08-10); prove_backup_restore (PS:4066 'it also reddens prove_backup_restore.py:384', recorded from 12d16a2).

**Mechanism.** Each is a written observation of the instrument producing a non-green outcome (or, for shop_code, its false green being caught), which is what makes those greens evidence.

**Measured by.** Greps over PROJECT_STATUS.md, OPEN_ITEMS.md, lessons/*.md with the named words plus per-name context greps; the cited lines were read

**Also involved:** `PROJECT_STATUS.md:3672`; `PROJECT_STATUS.md:4742`; `OPEN_ITEMS.md:451`; `lessons/all-lessons.md:806`

### [C | T3] PROJECT_STATUS.md:3282

**Claim.** GROUP (1), mobile side: proveSignOut (PS:3221-3225 'observed going RED', exit 1 / 10 failed cells; PS:3282 'exit 1, SEVEN live cells'); proveCart (PS:545-547 'One case went red' — crash injector, and the worse half: the other stayed green over the wrong transaction); proveNotice (PS:2908-2910 false positive found and fixed in the proof itself); proveForbidden (lessons/403-is-about-what-the-caller-may-do.md:91 F5 runs the OLD mapping, measured); proveDraftOwner (lessons/a-green-cell-is-evidence-about-the-assertion-not-the-claim.md:95 mutation reddened 'its LINES survive too — 0 of 1', recorded in fde2b0c).

**Mechanism.** Same word set as the server search, applied to the camelCase names and prove:* spellings.

**Measured by.** Grep prove(Sync|Cart|SignOut|Notice|Forbidden|DraftOwner|…)|prove:[a-z]+ with context over the three file sets; cited lines read

**Also involved:** `PROJECT_STATUS.md:545`; `PROJECT_STATUS.md:2908`; `lessons/a-green-cell-is-evidence-about-the-assertion-not-the-claim.md:95`

### [C | T3] desktop/.gitkeep:1

**Claim.** desktop/ contains exactly one file, .gitkeep — the third LOCKED architecture component (back office, master data UI, thermal printing) has no code, so there is nothing to exercise and no proof; group (3) is vacuous there but the component's entire surface is unbuilt.

**Mechanism.** Glob desktop/** returns only .gitkeep.

**Measured by.** Glob desktop/**

### [C | T3] mobile/package.json:15

**Claim.** The census is 41 proof entry points: 24 prove:* scripts (lines 15-38, each mapping to a distinct source in mobile/src/proof/) plus 17 server/scripts/prove_*.py. The phase brief's 'fourteen' is refuted.

**Mechanism.** package.json declares exactly 24 prove:* scripts; Glob over server/scripts/prove_*.py returns exactly 17 files; 24 entry sources + 9 support files (fakes, harness, fileServer, proofDevice, claimWorker, 4 crash children) account for all 33 files in mobile/src/proof/.

**Measured by.** Read mobile/package.json in full; Glob server/scripts/prove_*.py and mobile/src/proof/**

### [C | T3] mobile/src/sync/engine.ts:107

**Claim.** All six SyncEngine public operations are exercised by node proofs — the engine-operation slice of group (3) is EMPTY: runOnce (15 proof files), runUntilQuiescent (7), resumeAfterSignIn (7), recoverInterrupted (3: proveSync, proveCart, sqliteProof), resetAfterSignOut (2: proveSignOut, proveStatusCounts), retryMasterDataNow (1: proveSync only).

**Mechanism.** Per-method grep over mobile/src/proof; createLocalBill/buildLocalBill and store.requestVoid (SqliteLocalStore.ts:866) are likewise driven by the void/cart/owner proofs.

**Measured by.** Six separate greps over mobile/src/proof, files_with_matches per method; engine.ts:107-275 read for the public surface

**Also involved:** `mobile/src/sync/createBill.ts:104`; `mobile/src/adapters/sqlite/SqliteLocalStore.ts:866`

### [C | T3] server/app/main.py:196

**Claim.** Every one of the 37 registered server API routes is exercised by at least one proof script — the server-route slice of group (3) is EMPTY.

**Mechanism.** Route inventory: main.py 3 (GET /health, POST /auth/login, GET /whoami), users.py 7 (GET/POST /users, revoke-sessions, deactivate, activate, me/password, {id}/password), directory.py 1 (POST /auth/shop-code), reports.py 1 (GET /reports/daily), master.py 21 (uoms/product-categories/sellers 5 each incl. deactivate+activate, products 6 incl. PUT prices), bills.py 4 (POST/GET /bills, GET /bills/{id}, POST /bills/{id}/void). Every path string was found invoked in at least one prove_*.py: /health (prove_clock_guard:177+, prove_shop_code:187+, prove_user_create:306+, prove_year_gate:260), password routes (prove_user_create:243,252), revoke/deactivate/activate (prove_revocation:212,599,699), all master activate/deactivate (prove_master_write:551-722), shop-code (prove_shop_code), reports (prove_daily_report), bills quartet (prove_bills:142-294).

**Measured by.** Grep @router/@app registrations over server/app; Read main.py in full; Grep every route path string over server/scripts

**Also involved:** `server/app/users.py:225`; `server/app/master.py:292`; `server/app/bills.py:282`; `server/app/directory.py:87`; `server/app/reports.py:421`

### [C | T3] server/scripts/prove_auth.py:59

**Claim.** Assertion-vs-name check on the four server proofs read in full: prove_auth's 8 cases exercise exactly what its name claims (real-HTTP login/token issue, SET LOCAL tenant context read back via /whoami, 401 on no/tampered token, wrong password, cross-tenant); prove_rls proves isolation AS the RLS-bound app role with a no-context fail-closed step and composite-FK rejections, asserting role attributes first; prove_bills covers create/replay/void/concurrency/total-mismatch/created_by with both comparison sides derived from separate requests; prove_reconcile injects 19 named violations into a restored copy, asserts the human report names the rows, requires undo-to-green, separates exit 2 (unfit fixture) from exit 1, and lists what it deliberately does NOT inject (S4 attribute clause — cluster-wide role safety).

**Mechanism.** Names hold; each proof also states its own bounds in-file rather than overclaiming.

**Measured by.** Read prove_auth.py, prove_rls.py, prove_bills.py, prove_reconcile.py in full

**Also involved:** `server/scripts/prove_rls.py:203`; `server/scripts/prove_bills.py:241`; `server/scripts/prove_reconcile.py:1059`

### [C | T3] server/scripts/prove_master_write.py:489

**Claim.** The one branch on the money path that WAS group (3) for four phases — the concurrent same-idempotency-key race in bills.py — is now entered by a proof: I1 races two POST /bills with the SAME key behind a threading.Barrier, requires printed positive overlap, asserts [200,201] with no 500 and exactly ONE row for the key.

**Mechanism.** The old handler's getattr(e.orig,'constraint_name','') was always '' (asyncpg dialect chains the real exception as __cause__), so the branch had never executed and the loser got a 500 = retried forever; prove_bills CASE 2 (sequential replay, answered by the pre-check SELECT) and CASE 5 (different keys) both structurally miss it. Observed fixed 2026-07-28: 37.5 ms overlap, [200,201], one bill (PROJECT_STATUS.md:2728-2731).

**Measured by.** Read prove_master_write.py:488-542, lessons/a-defaulted-getattr-is-a-silent-dead-branch.md in full, prove_bills.py:240-266, PROJECT_STATUS.md:2726-2731

**Also involved:** `lessons/a-defaulted-getattr-is-a-silent-dead-branch.md:31`; `server/scripts/prove_bills.py:243`

### [C | T4] mobile/src/adapters/httpTransport.ts:162

**Claim.** sendBill has no 409 branch, so the year gate's refusal of a bill create (HTTP 409, bills.py:503) reaches the device as 'unavailable, reachable: true' — the bill stays queued and retried and feeds the poison counter, presenting a deliberate clock refusal as a server outage.

**Mechanism.** bills.py:503-513 answers the year-gate refusal with 409; httpTransport.sendBill's status ladder handles 201/200/400/422/401/403/424 and everything else falls to unavailable-reachable (159-166). markPendingAgain then increments server_error_attempts (SqliteLocalStore.ts:713-733), driving toward the 'call support' alarm over a refusal only a server-clock fix clears. Not a permanent write itself — the bill is protected, not damaged — recorded because the permanent write's guard is invisible as itself from the device.

**Measured by.** Read httpTransport.ts:127-166 against bills.py:503-513; grep of httpTransport.ts for 409 (present only in voidBill at 221).

**Also involved:** `server/app/bills.py:503`; `mobile/src/adapters/sqlite/SqliteLocalStore.ts:721`

### [C | T4] mobile/src/adapters/sqlite/SqliteDraftStore.ts:339

**Claim.** Draft promotion hard-deletes the draft rows in the same driver transaction that inserts the bill (via the shared BILL_INSERT_SQL), so the delete of typed weights for a real load is guarded by transaction atomicity on the real device path; the crash-window assertion itself lives only in proof scripts.

**Mechanism.** promoteToBill runs DELETE FROM local_draft_lines / local_draft inside tx alongside the bill insert (SqliteDraftStore.ts:339-340); BILL_INSERT_SQL is defined once in SqliteLocalStore.ts:213-215 precisely so the two call sites cannot drift. The transaction mechanism (mutex.ts serialisation + transaction()) runs on the real path; that a crash between statements leaves neither/both is asserted by src/proof/cartCrashChild.ts and draftCrashChild.ts — proof-only, on the node driver, not on a handset per PROJECT_STATUS conventions.

**Measured by.** Grep of mobile/src for DELETE statements; read SqliteLocalStore.ts:196-263 (BILL_INSERT_SQL sharing rationale); read SqliteLocalStore.ts header (1-25) on why transaction() exists.

**Also involved:** `mobile/src/adapters/sqlite/SqliteLocalStore.ts:213`; `mobile/src/adapters/sqlite/mutex.ts:1`

### [C | T4] mobile/src/adapters/sqlite/SqliteLocalStore.ts:879

**Claim.** requestVoid's WHERE void_requested_at IS NULL makes the first reason and requester identity permanent on the local row — a second press changes zero rows — and the server then stores that reason verbatim; the reason on a real-money reversal is fixed at first tap.

**Mechanism.** The guard is the statement itself (866-883): reason, void_requested_at and the requester columns are written only when void_requested_at IS NULL, in one implicit-transaction statement, requester read live in the same call. engine.ts:420 sends bill.void_reason unchanged on every attempt (byte-identical retries, per the comment at engine.ts:449-456), and bills.py:696-703 writes it into void_reason permanently. Real path; validation is the one-shot guard plus the server's min_length=1.

**Measured by.** Read mobile/src/adapters/sqlite/SqliteLocalStore.ts:855-945, mobile/src/sync/engine.ts:406-560, server/app/bills.py:672-704.

**Also involved:** `mobile/src/sync/engine.ts:420`; `server/app/bills.py:702`

### [C | T4] server/app/bills.py:537

**Claim.** The bill INSERT (header 537-569, items 570-584) is the core hard-rule-5 permanent write, and every validation before it runs on the real HTTP path: server-side Decimal recompute, edge scale/sign checks, idempotency in code and constraint, tenant-composite FKs, and DB CHECKs.

**Mechanism.** Before the write: pydantic mirrors column scale/sign exactly (BillItemIn, 175-181; total 196-198), duplicate line_no (290), net=gross-tare (295), client total must equal server total or 422 (303-307), idempotency pre-SELECT under tenant RLS (312-320) with uq_bills_tenant_idem (0001:214) as backstop and an IntegrityError re-check that returns the existing bill (607-616), seller/product resolved in-tenant with list_price stamped server-side from product_prices (329-406, client value discarded), amount computed server-side ROUND_HALF_UP (151-152, 300). DB layer: NUMERIC columns, CHECK constraints incl. ck_items_net and ck_bills_void_consistency, composite (tenant_id, id) FKs, partial unique doc_no index (0001:200-268, 233-239). Residual, by design: unit_price is client-typed and permanent with only ge=0 and scale bounding it — it is the paid price (hard rule 6), and on the device the only pre-payment validation is the numpad's dp/maxIntDigits bounding and parseWeight/parsePrice in cart.ts:78-107, so a fat-fingered in-scale price becomes permanent money on both sides.

**Measured by.** Read server/app/bills.py in full, server/migrations/versions/0001_initial_schema.py in full, mobile/src/cart/entry.ts in full, grep of mobile/src/cart/cart.ts money path.

**Also involved:** `server/migrations/versions/0001_initial_schema.py:214`; `server/migrations/versions/0001_initial_schema.py:267`; `server/app/bills.py:312`; `server/app/bills.py:371`; `mobile/src/cart/cart.ts:78`

### [C | T4] server/app/bills.py:696

**Claim.** The void UPDATE (voided_at/by/reason) is permanent — no un-void route exists anywhere in server/app — and is validated on the real path by require_admin (role re-read from the DB per request), a 404 check, a 409 already-voided check, a non-empty reason, and ck_bills_void_consistency; doc_no and the counter are deliberately untouched so the number is never reused.

**Mechanism.** require_admin resolves the role from the users row under tenant context on every request (auth.py get_principal, 192-230 — the DB is the authority, not the token claim); void_bill pre-reads voided_at (684-693) so a second void 409s and the first reason survives; VoidRequest.reason has min_length=1 (201-202); the DB CHECK (0001:224-228) forces all three void fields to move together. All on the real HTTP path; prove_bills.py exists on top but is not the guard.

**Measured by.** Read server/app/bills.py:672-704, server/migrations/versions/0001_initial_schema.py:224-228, grep of server/app/auth.py for get_principal/require_admin/is_active/token_version.

**Also involved:** `server/app/auth.py:100`; `server/migrations/versions/0001_initial_schema.py:224`

### [C | T4] server/scripts/provision_shop.py:287

**Claim.** Tenant and first-admin rows are written BEFORE the shop code is issued, so a code-issuance failure leaves a half-provisioned shop on purpose — the script says so and routes recovery through --tenant-id rather than a blind re-run.

**Mechanism.** The two INSERTs at 287-303 land in one transaction under tenant_connection (SET LOCAL GUC); the code INSERT happens later on the owner engine (337-344). The MAX_CODE_ATTEMPTS exhaustion message (369-379) states 'the tenant and its admin user were created and are still there; only the code is missing' and names the --tenant-id path. The admin password is validated only as non-empty from the environment (259-267); the Thai shop name crosses argv with no byte-level validation in code — the pre-write argv hex measurement recorded in CLAUDE.md is a manual workflow step, not a check this script performs.

**Measured by.** Read server/scripts/provision_shop.py:229-379.

**Also involved:** `server/scripts/provision_shop.py:369`; `server/scripts/provision_shop.py:259`

### [C | T5/T6-mobile] E:\recycle-online\mobile\App.tsx:583

**Claim.** backoffBaseMs: 2000 / backoffMaxMs: 30000 are passed uncommented at the engine construction site, and the 30-second value is restated as prose in at least four other places: App.tsx:1063-1064 ('up to 30 seconds'), SqliteLocalStore.ts:447 ('up to 30s out'), clockSanity.ts:74 ('30s in App.tsx'), queueHealth.ts:82 ('backoffMaxMs, 30s in App.tsx').

**Mechanism.** Only one of the dependents is mechanical (the constructor throw against SEND_SCHEDULE_HORIZON_MS); the rest are knowledge in a person. A change to 30000 leaves four comments and one alarm bound (MAX_ATTEMPT_CYCLE_MS, reported separately) describing a system that no longer exists, with no failing check.

**Measured by.** Read App.tsx 574-584 and 1060-1065; SqliteLocalStore.ts 437-451; clockSanity.ts 68-86; queueHealth.ts 79-106.

**Also involved:** `E:\recycle-online\mobile\App.tsx:1064`; `E:\recycle-online\mobile\src\adapters\sqlite\SqliteLocalStore.ts:447`; `E:\recycle-online\mobile\src\time\clockSanity.ts:74`; `E:\recycle-online\mobile\src\sync\queueHealth.ts:82`

### [C | T5/T6-mobile] E:\recycle-online\mobile\App.tsx:833

**Claim.** The sync tick `setInterval(() => void syncOnce(), 4000)` is a bare constant at its only definition site, while prose in three other files treats 4 seconds as a fact of the system: engine.ts:444 ('about every four seconds, for ever'), types.ts:352-353 ('re-POSTed the void on every 4-second pass'), SqliteLocalStore.ts:151-152 ('roughly every four seconds').

**Mechanism.** The three remote comments quantify the rate of the historical void-hammering defect and of the still-open refused-void retry hazard. Changing the tick changes those rates; nothing at line 833 points at the three sites, and nothing at the three sites points back, so they drift silently.

**Measured by.** Read App.tsx 831-835, engine.ts 440-445, types.ts 346-356, SqliteLocalStore.ts 150-162.

**Also involved:** `E:\recycle-online\mobile\src\sync\engine.ts:444`; `E:\recycle-online\mobile\src\sync\types.ts:353`; `E:\recycle-online\mobile\src\adapters\sqlite\SqliteLocalStore.ts:151`

### [C | T5/T6-mobile] E:\recycle-online\mobile\App.tsx:1105

**Claim.** setupShop's async body is try/finally with no catch: it assumes resolveShopCode and shopStore.save return every failure as a value, and a throw from either (shopStore.save is a SQLite write) becomes an unhandled promise rejection — busy resets via finally but no notice reaches the screen.

**Mechanism.** The sibling handler signIn keeps a catch precisely for post-success faults (App.tsx:1071-1081, 'STILL HERE...'); setupShop has no equivalent, so a keystore/DB-layer throw during shop setup leaves the operator at a silent button. The assumption that resolveShopCode never throws is unstated at the call site.

**Measured by.** Read App.tsx 1098-1119 (try/finally, no catch) against 1071-1084 (signIn's catch and its rationale).

**Also involved:** `E:\recycle-online\mobile\App.tsx:1071`

### [C | T5/T6-mobile] E:\recycle-online\mobile\App.tsx:1156

**Claim.** The onSignOut header says 'SqliteIdentityStore.clear() exists, it belongs to a deliberate sign-out, and it is called from nowhere at this commit' — the 'called from nowhere' clause is false as worded: four proof files call it on real SqliteIdentityStore instances.

**Mechanism.** proveDraftOwner.ts:350, proveCacheTenant.ts:453, proveMigration.ts:386 and proveStatusCounts.ts:294 all invoke identity.clear() (proveDraftOwner's `identity` field is typed SqliteIdentityStore at line 79 and constructed at 87). The sentence is true only if scoped to production wiring, which it does not say. This is the exact unscoped-negative-claim shape CLAUDE.md's workflow section records as having misled an advising session for a full day over SecureTokenStore.clear().

**Measured by.** Grep `\.clear\(` over mobile/ (11 hits) and read of proveDraftOwner.ts lines 38, 79, 87, 350 confirming the receiver's concrete type.

**Also involved:** `E:\recycle-online\mobile\src\proof\proveDraftOwner.ts:350`; `E:\recycle-online\mobile\src\proof\proveCacheTenant.ts:453`; `E:\recycle-online\mobile\src\proof\proveMigration.ts:386`; `E:\recycle-online\mobile\src\proof\proveStatusCounts.ts:294`

### [C | T5/T6-mobile] E:\recycle-online\mobile\src\sync\engine.ts:28

**Claim.** batchLimit's doc comment says 'Bills examined per pass. Bounds the work of one run; not a retry cap' — it silently also bounds VOIDS applied per pass, because applyVoids reuses it as listVoidsToApply(this.batchLimit) at line 407.

**Mechanism.** A caller lowering batchLimit to throttle sends (its documented purpose) also throttles void application to the same number per 4-second pass; the doc names only bills. runUntilQuiescent's termination test does include owed voids (line 610-611), so proofs would still terminate — only the per-pass rate changes, invisibly.

**Measured by.** Read engine.ts 27-28, 407, 606-612.

**Also involved:** `E:\recycle-online\mobile\src\sync\engine.ts:407`

### [C | T5/T6-mobile] E:\recycle-online\mobile\src\sync\engine.ts:641

**Claim.** The comment justifying clearBackoffForPending — 'an older bill that failed a few times stays invisible to listReadyToSend while newer bills sail past it and take lower doc_no values' — describes a mechanism the engine no longer has: it does not call listReadyToSend, and under strict head-of-line order nothing can sail past anything.

**Mechanism.** The send loop reads listPendingOldestFirst with backoff ignored (engine.ts:339) and breaks the pass when the head is not due (engine.ts:369), so an in-backoff older bill now stalls the queue rather than being overtaken. SqliteLocalStore.ts:176-177 states it outright: 'The engine no longer calls listReadyToSend at all — it reads listPendingOldestFirst and gates in TS.' The clear's real current effect is releasing the head's own backoff so the queue resumes in the same pass; a reader taking the comment as specification would conclude backoff-filtered candidate selection still exists in the send path.

**Measured by.** Read engine.ts 264-396 (queue read, head-of-line break, the comment at 638-643) and SqliteLocalStore.ts 166-187 plus the grep showing listReadyToSend is called only by proofs and defined in types.ts:519.

**Also involved:** `E:\recycle-online\mobile\src\sync\engine.ts:339`; `E:\recycle-online\mobile\src\sync\engine.ts:369`; `E:\recycle-online\mobile\src\adapters\sqlite\SqliteLocalStore.ts:177`

### [C | T5/T6-server] server/app/clock_guard.py:48

**Claim.** TICK_SECONDS is read from env CLOCK_GUARD_TICK_SECONDS with the comment 'Env-settable ONLY so the proof can drive it fast' — nothing validates the value, so a deployment that sets it to 0 or a negative number turns tick_forever into a hot loop evaluating against the database continuously

**Mechanism.** float(os.environ.get(...)) accepts any float; asyncio.sleep(0) and sleep(negative) return immediately, so the while-True loop runs evaluate() back-to-back, one DB round-trip per iteration, forever, with no error. The 'proofs only' scoping of the env var is a convention that lives in this one comment

**Measured by.** Read clock_guard.py in full; tick_forever at 203-219 has no bound on TICK_SECONDS

**Also involved:** `server/app/clock_guard.py:212`

### [C | T5/T6-server] server/app/db.py:47

**Claim.** Comment on directory_engine says 'Nothing in the application opens a connection on it yet; no endpoint resolves a code' — directory.py's POST /auth/shop-code opens directory_connection() (which connects on directory_engine) on every request

**Mechanism.** The comment was true when the engine landed and went false when directory.py shipped; nothing announced the turn. A reader believing it might treat the engine, its dispose in lifespan, or its .env key as dead scaffolding

**Measured by.** Read db.py:45-50 and directory.py:87-128; resolve_shop_code awaits directory_connection() at directory.py:116

**Also involved:** `server/app/directory.py:116`; `server/app/main.py:81`

### [C | T5/T6-server] server/app/directory.py:93

**Claim.** Docstring cites 'main.py:137-138 verifies against DUMMY_HASH when no user is found' — the DUMMY_HASH verify now sits at main.py:239-240; lines 137-138 are inside the validation-error handler's docstring

**Mechanism.** Line-number citation rotted when main.py grew the RequestValidationError handler above the login route; the claim itself (timing equalisation exists) is still true, but the pointer resolves to unrelated text

**Measured by.** Read directory.py:89-111 and main.py:238-243; verify_password(DUMMY_HASH, ...) is at main.py:240

**Also involved:** `server/app/main.py:240`

### [C | T5/T6-server] server/app/main.py:1

**Claim.** Module docstring says 'FastAPI app for Phase 1b: login, whoami probe, health. No bill or master-data endpoints yet — this phase exists only to prove the per-request tenant-context layer' — the module now mounts bills, directory, master, reports and users routers and titles itself Phase 2c-2

**Mechanism.** Stale present-tense docstring at the top of the app's entry module; a new reader trusting the first five lines concludes the API surface is three endpoints. Refuted six imports and five include_router calls later in the same file

**Measured by.** Read main.py in full; include_router calls at lines 196-200, title 'Recycle Online API (Phase 2c-2)' at line 84

**Also involved:** `server/app/main.py:196`; `server/app/main.py:84`

### [C | T5/T6-server] server/migrations/versions/0007_users_is_active.py:127

**Claim.** 0007's docstring says 'users has no list endpoint at all, so there is nothing here that even could filter yet, and the comment is what tells whoever writes the first one (P3.7) that it must not' — GET /users exists and filters is_active via _active_filter (legitimately: it is a list, not a row-level read, and its docstring argues the distinction)

**Mechanism.** Present-tense claim in a migration docstring that went false when users.py landed; harmless in direction (the endpoint that arrived obeys the COMMENT ON COLUMN rule) but a reader is told a route is unbuilt that has been built and proven

**Measured by.** Read 0007:119-128 and users.py:225-277 (list_users, _active_filter usage at 272, the 'A LIST IS NOT A ROW-LEVEL READ' argument at 249-256)

**Also involved:** `server/app/users.py:225`; `server/app/users.py:272`

### [C | T5/T6-server] server/migrations/versions/0009_directory_shop_codes.py:16

**Claim.** 0009's docstring makes four present-tense claims that are now false: 'NOTHING READS THIS RELATION YET. No endpoint resolves a code' (line 16); debt (b) 'restore_db.py WILL REPORT A FALSE FAILURE ON THE NEXT RESTORE ... NOT FIXED HERE' (lines 103-116); debt (a)/(c) 'S4 today selects rolname, rolsuper and rolbypassrls only ... does not read rolconfig at all, and does not name recycle_directory' (lines 129-131); and its main.py line references ('app/main.py:125', 'app/main.py:156-159', line 9-11) no longer resolve

**Mechanism.** All three debts were paid after the migration was written: directory.py resolves codes; restore_db.py now walks the manifest's own keys (its comment at 434-442 describes fixing exactly the directory.shop_codes false failure 0009 predicted); reconcile.py's REQUIRED_ROLES declares recycle_directory with search_path=directory and S4 reads rolconfig and compares it. A reader of 0009 — the most detailed document about this relation — is told the lookup is unbuilt, restores are broken, and the checker is blind, all three wrong. The cited reconcile.py/backup_db.py line numbers (809, 818, 837, 886-888, 436-440, 329-362) also no longer match after both files were rewritten

**Measured by.** Read 0009 in full; read directory.py:87-128, restore_db.py:141-157 and 434-471 (split_key handles dotted keys; ONE KEY SET comment names the fix), reconcile.py:353-357 (REQUIRED_ROLES) and 968-1014 (S4 rolconfig comparison), main.py:227 (tenant_connection(body.tenant_id)) and main.py:259-261 (the 'replaces the uuid' comment)

**Also involved:** `server/scripts/restore_db.py:443`; `server/scripts/reconcile.py:356`; `server/app/directory.py:116`; `server/app/main.py:227`

### [C | T5/T6-server] server/scripts/reconcile.py:352

**Claim.** REQUIRED_ROLES comment says the S4 schema-existence boundary 'is owed a CANNOT_SEE entry and does not have one yet' — the same file's CANNOT_SEE now carries exactly that entry ('S4 CHECKS THE VALUE OF A ROLE'S search_path AND NEVER THAT THE SCHEMA EXISTS', with the 0008-vs-downgraded distinction the comment describes)

**Mechanism.** One file, two passages about the same boundary, one saying the entry is absent and one being the entry. A reader at the constant concludes a debt is open and may re-add the entry or re-queue the work

**Measured by.** Read reconcile.py:347-357 and reconcile.py:1306-1324 in the same pass

**Also involved:** `server/scripts/reconcile.py:1306`

### [C | T5/T6-server] server/scripts/reconcile.py:356

**Claim.** REQUIRED_ROLES hard-codes 'search_path': 'directory' as a deliberate hand-maintained restatement of db/init/00_init_roles.sql:87; renaming the schema in migration 0009 and the bootstrap together leaves this literal stale and S4 goes red on a healthy cluster

**Mechanism.** The comment at 338-345 declares the restatement and forbids deriving it from either source (that would destroy the disproof); the failure direction is a false RED, not a false green, so it is loud — but the third copy of the name is knowledge a renamer must know exists, and only this comment says so

**Measured by.** Read reconcile.py:325-357 and 00_init_roles.sql:70-87 ('THIS NAME MUST MATCH THE SCHEMA MIGRATION 0009 CREATES')

**Also involved:** `server/db/init/00_init_roles.sql:87`; `server/migrations/versions/0009_directory_shop_codes.py:372`

### [C | T7] mobile/App.tsx:586

**Claim.** The cold-start path runs recovery and refresh steps (recoverInterrupted resetting `syncing` rows, cache load, token restore, refreshMaster) that have no counterpart on foreground resume: no AppState subscription exists anywhere in mobile/, so resume re-runs none of them — only the 400ms/4s intervals continue.

**Mechanism.** All recovery lives in the once-per-mount boot effect (useEffect with [] deps). A process brought back from background does not re-mount, so a bill left in `syncing` by an OS-suspended send is reset only by the durable claim/idempotency design, and master data is not refreshed on resume unless an operator opens the picker or starts a cart.

**Measured by.** Read of App.tsx:553-646; Grep for AppState|addEventListener|appState over mobile/ (no matches)

**Also involved:** `mobile/App.tsx:716`; `mobile/src/sync/engine.ts:260`

### [C | T7] mobile/App.tsx:810

**Claim.** Send unavailability updates the online strip; void unavailability never does: syncOnce returns at `if (r.attempted === 0) return` before reading voidsRetryable, and no later branch consumes it.

**Mechanism.** A pass that sends nothing (queue empty or head in backoff) but pushes voids and gets network errors reports voidsRetryable > 0 with attempted === 0, so syncOnce returns without touching setOnline. A device whose only remaining work is voids never flips the strip offline however long they bounce; the same failure on a send sets online=false at line 828. engine.ts:361-366 records the same shape for a pass that attempts nothing.

**Measured by.** Read of App.tsx:729-829 (syncOnce, all branches) and engine.ts SyncRunResult fields

**Also involved:** `mobile/App.tsx:828`; `mobile/src/sync/engine.ts:361`

### [C | T7] mobile/App.tsx:833

**Claim.** The bill-send queue retries on an unconditional 4-second interval; the master-data refresh retries only on operator events (boot, picker open, cart start, sign-in) with no periodic retry of a failed refresh.

**Mechanism.** setInterval(syncOnce, 4000) drives sends regardless of prior failure; refreshMaster is invoked only at App.tsx:638 (boot), 1060 (sign-in), 1223 (openPicker), 1237 (cart-start effect). A boot refresh that fails is not retried until the next tap; the failure surfaces only as the cache age growing, which the freshness gate converts into an empty price default.

**Measured by.** Read of App.tsx:553-646, 831-835, 1220-1240; grep for refreshMaster call sites

**Also involved:** `mobile/App.tsx:638`; `mobile/App.tsx:1223`; `mobile/src/master/freshness.ts:1`

### [C | T7] mobile/src/sync/engine.ts:376

**Claim.** Dedup on sends is a durable store claim plus an in-memory set (claimForSend, 'even one in a different process that we cannot see'); dedup on voids is the in-memory inFlight set only.

**Mechanism.** applyVoids guards with `void:${bill.id}` in this.inFlight and never takes a durable claim, so two engine instances over the same database can double-POST the same void. The server converges it (409 -> already_voided is success), so the absent half permits duplicate requests, not duplicate state.

**Measured by.** Read of engine.ts:373-380 (claimForSend) and 406-412 (applyVoids inFlight only)

**Also involved:** `mobile/src/sync/engine.ts:409`; `mobile/src/adapters/httpTransport.ts:221`

### [C | T7] mobile/src/sync/engine.ts:400

**Claim.** The void-apply queue has no backoff, no time gate, and no attempt cap, while the bill-send queue has exponential backoff (base 2s, cap 30s in App.tsx), a due-time gate, and a clock-sanity horizon on its schedule.

**Mechanism.** listVoidsToApply's predicate (void_requested_at IS NOT NULL AND voided_at IS NULL AND void_refused_at IS NULL AND sync_state='synced' AND doc_no) carries no next-attempt column, so every 4-second tick re-POSTs every owed void while the server is unreachable or erroring. The send path writes next_attempt_at via backoffFor and reads it through scheduledInstantIsDue. Both queues push state to the same server for the same bills. httpTransport.ts:30-34 records the observed cadence ('re-POSTed it every four seconds, forever').

**Measured by.** Read of engine.ts:398-560 and 752-755, SqliteLocalStore.ts:141-144 and 924-940 (grep), httpTransport.ts:25-34

**Also involved:** `mobile/src/adapters/sqlite/SqliteLocalStore.ts:936`; `mobile/src/sync/engine.ts:752`; `mobile/src/sync/engine.ts:369`

### [C | T7] mobile/tsconfig.json:9

**Claim.** The two TypeScript programs apply different strictness to disjoint file sets: the node program adds noImplicitReturns, noFallthroughCasesInSwitch, noUnusedLocals, noUnusedParameters, noImplicitOverride, useUnknownInCatchVariables and verbatimModuleSyntax; the app program has only strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes — and App.tsx, app/*, and src/device/* are seen by the app program alone.

**Mechanism.** Shared src/ files (engine, adapters, cart, session) are checked under both option sets; UI and device code — including SecureTokenStore and the expo-sqlite driver — is checked only under the weaker set, so e.g. a switch fallthrough or a code path missing a return in App.tsx compiles green in both commands. Coverage itself has no gap: src/device is excluded from node but included in app; src/proof and nodeDriver.ts are excluded from app but included in node.

**Measured by.** Read of mobile/tsconfig.json and mobile/tsconfig.node.json in full; git ls-files to confirm the file sets

**Also involved:** `mobile/tsconfig.node.json:20`; `mobile/tsconfig.json:15`; `mobile/tsconfig.node.json:35`

### [C | T7] server/app/bills.py:201

**Claim.** Human-typed strings are length-capped at the edge on the master router (Code 64, Name 200, Phone 32, Address 500, VehicleNo 32) and uncapped on the bills router: VoidRequest.reason has min_length only and BillCreate.vehicle_no is a bare `str | None`.

**Mechanism.** purchase_bills.vehicle_no and void_reason are bare text columns (migrations 0002:33, 0001:212), so an arbitrarily large string is stored on the bill row and echoed by _read_bill and the daily report's void payloads. The master router caps the equivalent hand-transcribed fields, including the seller's own vehicle_no at 32.

**Measured by.** Read of bills.py:187-202, master.py:90-97 and 740-742; Grep of migrations 0001/0002 for column types

**Also involved:** `server/app/master.py:742`; `server/migrations/versions/0002_bills_docno_and_vehicle.py:33`; `server/app/bills.py:190`

### [C | T7] server/app/bills.py:291

**Claim.** Two refusal-body shapes coexist inside bills.py and across its siblings: create_bill's 422s, get_bill's 404 and void_bill's 404/409 are plain strings, while the same router's 424 and year-gate 409 — and every refusal in master.py, users.py, auth.py, reports.py — use the {kind, code, message} envelope.

**Mechanism.** HTTPException(status, "duplicate line_no within bill") vs _master_data_missing/_not_found dict envelopes. Clients contract on status only (httpTransport reads the body's code opportunistically), so the divergence shows to log readers and any future body-consuming client, which finds `detail` as a string on some bills refusals and a dict on others.

**Measured by.** Read of bills.py:282-307, 668, 693 vs 77-87, 503-513; master.py:100-145; auth.py:25-50; reports.py:215-220

**Also involved:** `server/app/master.py:109`; `server/app/bills.py:77`; `server/app/bills.py:668`

### [C | T7] server/app/bills.py:545

**Claim.** Tenant_id is written by two different mechanisms on equivalent INSERT paths: master.py and users.py write the GUC readback expression _TENANT ('no handler passes a tenant_id at all and none can pass the wrong one'), while bills.py binds principal.tenant_id as an ordinary parameter on both the header and item INSERTs.

**Mechanism.** The values are equal today because tenant_connection sets the GUC from the same principal.tenant_id (db.py:113-117), and RLS WITH CHECK backstops both. The bills path is the hand-passed variant master.py's own doc identifies as the one that can be wrong; the asymmetry is which layer guarantees agreement.

**Measured by.** Read of bills.py:537-584, master.py:76-80, users.py:479-496, db.py:86-118 (grep)

**Also involved:** `server/app/master.py:80`; `server/app/users.py:486`; `server/app/db.py:114`

### [C | T7] server/app/bills.py:630

**Claim.** List endpoints are bounded on the bills/reports routers and unbounded on the master/users routers: GET /bills takes limit (default 50, le=200) and /reports/daily pages its lines, while GET /products, /sellers, /uoms, /product-categories and /users return every row with no limit parameter.

**Mechanism.** Master lists are the offline cache's source and are fetched whole by design (the mobile cache stores the full lists); the absent half means the response size on those five routes grows with tenant data with no cap, unlike their bills siblings.

**Measured by.** Read of bills.py:628-644, reports.py:421-435, master.py:292-303/393-407/593-625/810-821, users.py:225-277

**Also involved:** `server/app/master.py:593`; `server/app/users.py:225`

### [C | T7] server/app/main.py:32

**Claim.** LoginRequest's username and password are unconstrained str, while the sibling credential routes cap password at 128 explicitly to bound argon2 work per request (PASSWORD_MAX_LENGTH, 'an unbounded field lets one request occupy one [worker thread] for as long as it likes') and cap username at 64.

**Mechanism.** POST /auth/login runs verify_password on the submitted string on all three refusal arms (including DUMMY_HASH for an unknown user), so an arbitrarily large password reaches the argon2 worker from an unauthenticated caller — the exact resource bound users.py declares is absent on the one route reachable without a token. CurrentPassword on /users/me/password keeps the max for the same stated reason.

**Measured by.** Read of main.py:32-35, 221-294; users.py:283-333 and 721-723

**Also involved:** `server/app/users.py:319`; `server/app/users.py:721`

### [C | T7] server/app/main.py:186

**Claim.** Of the two unauthenticated bootstrap endpoints, only /health is exempt from the clock-guard refusal middleware: /auth/shop-code (device setup) is refused 503 while the guard is tripped, by the same `path != "/health"` test that deliberately covers /auth/login.

**Mechanism.** The middleware's exemption is the exact-path comparison; the docstring names login as the deliberate inclusion but does not name shop-code, which shares login's role (pre-principal bootstrap) and /health's role (no tenant data written). A new device cannot complete setup while the clock guard is tripped.

**Measured by.** Read of main.py:160-193 and directory.py:87-128

**Also involved:** `server/app/directory.py:87`

### [C | T7] server/app/main.py:202

**Claim.** The login refusal is a plain string ("invalid credentials") while every other identity refusal in the API (auth.unauthenticated, forbidden) carries the kind/code envelope.

**Mechanism.** _INVALID_LOGIN is HTTPException(401, detail="invalid credentials"); auth.py builds {kind:"unauthenticated", code, message} for the same 401 status on data routes. The byte-identical three-way collapse at login is documented as deliberate; the envelope absence is the un-argued half.

**Measured by.** Read of main.py:202-294 and auth.py:25-81

**Also involved:** `server/app/auth.py:46`

### [C | T7] server/app/master.py:160

**Claim.** A create retried after a lost response is answered 'already created' on the bills path (idempotency_key -> 200 with the same bill) and 'conflict' on every other create: POST /uoms, /product-categories, /products, /sellers and /users answer a replayed create with 409 duplicate_code.

**Mechanism.** No idempotency key exists on master or user creates; dedup is the per-tenant unique code constraint, and _raise_for_integrity translates the collision into a 409 the client must interpret as failure even though the row exists. bills.py:311-320 answers the same retry shape with the existing row. Hard rule 4 scopes the key to bills only; the asymmetry is what the other creates' retry gets.

**Measured by.** Read of master.py:152-172 and each create handler; users.py:497-507; bills.py:311-320

**Also involved:** `server/app/bills.py:311`; `server/app/users.py:505`

### [C | T7] server/app/reports.py:215

**Claim.** The refusal-envelope convention is imported on one sibling and re-declared on another: users.py imports master's _conflict/_not_found specifically so 'a second copy of a convention' cannot drift, while reports.py declares its own local _invalid duplicating master._invalid's shape.

**Mechanism.** reports._invalid is a hand-copied {kind:"invalid_request", code, message} builder with a comment asserting sameness; users.py:117-152 argues at length that the shape must be imported, never restated. Two sibling modules embody opposite policies for the same convention, so a change to master's envelope reaches users.py structurally and reports.py only if remembered.

**Measured by.** Read of reports.py:215-220 and users.py:117-152

**Also involved:** `server/app/users.py:152`; `server/app/master.py:141`


## Negative findings — searched for and not found

Each names its pattern and root, per the brief. These are the
difference between “absent” and “not found”; re-run the words to re-derive.

- not found with these words: seller_inactive|product_inactive over mobile/ — the two 424 codes the server added with retirement have no handling anywhere on the client (this is finding 1)
- not found with these words: GRADES, grade.*A.*B.*C.*D, ['A'],['B'] list literals over mobile/src — the A–D grade vocabulary has no client copy; it lives only in server/app/master.py:95 and the DB CHECK
- not found with these words: 543 over desktop/ — desktop/ holds only .gitkeep, so the warned-about third BE-offset copy (shopTime.ts:46-51's future thermal slip) does not exist yet
- not found with these words: "B-" (doc_no construction or parsing) over mobile/src outside src/proof and comments — production mobile code renders doc_no verbatim and never parses it
- not found with these words: async def login over server/app/auth.py — the login handler lives in server/app/main.py:222, not auth.py (dead-end grep recorded)
- not found with these words: 409 over mobile/src/adapters/httpTransport.ts sendBill branch — the create-path 409 (year_gate_refused) has no client mapping and falls to the reachable-unavailable catch-all
- not found with these words: 'prove_auth' within 2 lines of reddened|went red|goes red|turned red|was red|exit 1|refuted|FAILED|caught over PROJECT_STATUS.md, OPEN_ITEMS.md, lessons/*.md — the only incident is a DISCARDED piped run (PROJECT_STATUS.md:3679), not a red of the proof
- not found with these words: 'prove_master'|'prove_master_data_gate'|'prove_seller_pricing'|'prove_shop_time'|'prove_daily_report'|'prove_docno_clock'|'prove_year_gate'|'prove_clock_guard' near reddened|went red|goes red|turned red|was red|exit 1|refuted|FAILED|caught over PROJECT_STATUS.md, OPEN_ITEMS.md, lessons/*.md — these eight server proofs have green-run records and fixed-weakness notes (e.g. hardcoded 2569, seed-value literal) but no recorded red RUN; group (2)
- not found with these words: 'proveSync'|'sqliteProof'|'proveMoney'|'proveEntry'|'proveSeller'|'proveTime'|'proveCold'|'proveClock'|'proveVoid'|'proveVoidTerminal'|'proveVoidOwner'|'proveOwner'|'proveMigration'|'proveDaily'|'proveLogin'|'proveLoginScreen'|'proveStatusCounts'|'proveCacheTenant'|'proveSendOwner' near reddened|went red|goes red|turned red|was red|exit 1|refuted|FAILED|caught over PROJECT_STATUS.md, OPEN_ITEMS.md, lessons/*.md — these nineteen mobile proofs are group (2): exercised, no red record found with these words (lessons/a-green-cell-... records mutations against proveOwner/proveVoidOwner/proveVoidTerminal but my read did not establish an exit-1 run for them)
- not found with these words: '@router.(get|post|put|patch|delete)(' over server/app beyond the 37 registrations enumerated — no unlisted route exists to be uncovered
- not found with these words: '../device/' over mobile/src/proof — no proof imports the device adapters
- not found with these words: 'HttpTransport' over mobile/src/proof/proveSync.ts — the file proveSignOut:1257 says owns the 401 mapping does not touch the real transport
- not found with these words: 'provision_shop' as a subprocess/import over server/scripts/prove_*.py — only prose citations in prove_user_create.py
- not found with these words: '@router.delete' over server/app — no DELETE endpoint of any kind exists; every mutation is POST/PATCH/PUT.
- not found with these words: 'DELETE FROM purchase_bills|DELETE FROM purchase_bill_items' over server/app — hard deletes of transactions exist only in proof scripts under server/scripts (prove_reconcile.py:374-376, prove_year_gate.py:157-158), not on any API path.
- not found with these words: 'voided_at = NULL|unvoid' over server — no un-void route; a void is permanent once written.
- not found with these words: 'UPDATE directory|UPDATE shop_codes' over server — no code-rewrite path exists in the tree; shop-code immutability rests on the absence of such a path plus a COMMENT ON COLUMN, not on enforcement.
- not found with these words: 'DELETE FROM local_bills' over mobile/src — the device never hard-deletes a bill, including after a server sync acknowledgement; local bills only transition state.
- not found with these words: 'escpos|ESC/POS|print' over desktop/ — desktop/ contains only .gitkeep (git ls-files), so no printed-slip output code exists anywhere in the tree yet; the printed outputs that DO leave the system today are the shop code printed by provision_shop.py:383-388 (shown once, never again) and the backup directory written by backup_db.py.
- not found with these words: TODO|FIXME|XXX|HACK (as marker comments) over server/ and tools/ — the only hits are the string literals 'HACKED'/'HACK' used as test data in prove_rls.py:260,284
- not found with these words: '543' as a second Buddhist-era derivation over server/app — the sole occurrence is _BE_OFFSET at bills.py:120; reports.py:262 mentions '+ 543' only to forbid a second copy
- not found with these words: 'Asia/Bangkok'|'hours=7'|timezone construction as a second timezone definition over server/app — the sole definition is config.py:36-37; every other hit is prose or a documented negative example (reports.py:43 shows the predicate that must NOT be written)
- not found with these words: stale line references in 0008's docstring — its citations into db/init/00_init_roles.sql:106-107 were checked and still resolve to the ALTER DEFAULT PRIVILEGES statement
- not found with these words: drift between migration 0006's cited proof-script lines — prove_backup_restore.py ~207-214 (marker bill INSERT) and prove_rls.py ~104/311 (direct INSERTs) were checked and still hold approximately where cited
- not found with these words: `\.clear\(` — no production (non-proof) caller of SqliteIdentityStore.clear() over E:\recycle-online\mobile; the only non-proof hit is signOut.ts:363, which is SecureTokenStore.clear(), a different store. This CONFIRMS the intent of App.tsx:1156 while refuting its wording (see finding).
- not found with these words: `resetAfterSignOut` dangling/uncalled — over E:\recycle-online\mobile it is defined in engine.ts:247 and called from signOut.ts:374, so no stale-comment finding there.
- not found with these words: JUST_FETCHED_WINDOW_MS / PRICE_DEFAULT_CUTOFF_MS mismatch — over E:\recycle-online\mobile\src\master\freshness.ts the values are 5 min (line 139) and 12 h (line 117), matching App.tsx's ConfirmSaveDialog comment at 1796-1799 exactly; the candidate stale comment did not survive verification.
- not found with these words: `listReadyToSend` in the engine's executable code — over E:\recycle-online\mobile\src\sync\engine.ts it appears only inside the comment at line 641; the engine calls listPendingOldestFirst.
- not found with these words: AppState|addEventListener|appState over E:\recycle-online\mobile — no foreground-resume hook exists; startup mechanisms (recoverInterrupted, cache load, refreshMaster) have no resume-path invocation site
- not found with these words: idempotency over server/app/master.py and server/app/users.py — no idempotency key or replay handling on any master-data or user create
- not found with these words: FOR UPDATE over server/app/bills.py — the void path's SELECT takes no row lock
- not found with these words: StringConstraints|max_length over server/app/main.py (LoginRequest) and over BillCreate.vehicle_no / VoidRequest.reason in server/app/bills.py — no length bound at those edges
- not found with these words: void_next_attempt|backoff (void columns) over mobile/src/adapters/sqlite/SqliteLocalStore.ts — the void queue schema carries attempts and last_error but no schedule column
- not found with these words: first_server_error (void analog) over mobile/src — reachability evidence is recorded for sends only
- desktop/ contains only .gitkeep at this commit (git ls-files) — no desktop client exists to compare against the mobile client
- not found with these words: timeout|AbortController over getJson in mobile/app/api.ts — the master-data reads are the only requests in the tree without a timeout (api.ts's own comment at fetchDailyReport states the same)

## Opinions — beliefs without a measurement (labelled as the brief requires)

- The unmapped 409 on the send path (year gate → reachable-unavailable → retry forever → poison alarm 'call support') may be intended behavior — the alarm is arguably the right outcome for a wrong server clock — but nothing on the client says the choice was made; it is indistinguishable from the pre-403 gap that bit on the void path.
- money.ts configures decimal.js globally (Decimal.set at module load, line 31); toFixed's HALF_UP behavior depends on that process-global state, so any future module calling Decimal.set with different rounding would silently change every computed amount on the device. Not measured as reachable today — no other Decimal.set exists in mobile/src.
- reports.py:87 claims Postgres round(numeric,2) is 'the same HALF-UP-per-line arithmetic' as bills._line_amount; Postgres numeric round is half-AWAY-FROM-ZERO, identical to HALF_UP only while values are non-negative (which the CHECK constraints guarantee, and which reconcile.py:82-87 states as the reasoning). True today by that bound; the equivalence quietly breaks if a signed money column ever appears.
- The duplicated Thai action-wording tables (parkedReason FORBIDDEN_BY_ACTION, SESSION_TEXT, dailyView sentences) are wording, not logic, and were left out of findings — except where a sentence encodes a queue predicate (finding 11).
- The per-proof 'what it exercises' for 13 of 17 server proofs and 23 of 24 mobile proofs rests on full docstring reads plus route-string and import greps, not full-body reads; the docstrings in this repository are unusually candid about their own bounds (clock_guard, year_gate, shop_time, daily_report each name what they do NOT prove), so I believe the name-vs-assertion verdicts, but they are not measured to the same depth as the four proofs read in full.
- PROJECT_STATUS's device-pass claims (e.g. R1b exercising SecureTokenStore.clear() on a real iPhone) were treated per the project's own rule as clues, not sources — nothing in this audit re-verifies them, so the device-adapter group (3) finding stands on the node-suite gap alone.
- The prove_backup_restore red record (PROJECT_STATUS.md:4066 'it also reddens prove_backup_restore.py:384') reads as recorded-from-commit rather than a transcript of an observed run; I counted it as group (1) but with less confidence than the others.
- Group (3)'s center of gravity is entirely on the mobile UI/device seam plus one operator script: the server API surface and the engine's public operations are fully exercised, which is an unusually strong position — the residual risk is concentrated where tsconfig boundaries make proof coverage structurally impossible, and OPEN_ITEMS already knows it (with stale line numbers).
- The A-band null-doc_no path could also be entered via the duplicate (200) branch during recovery-after-crash, since recoverInterrupted re-sends and a parse failure on THAT response has the same effect — same mechanism, second entry point; I did not trace the recovery proof to see whether any proof covers a body-parse failure on a success status (I believe none does, based on proof file names only).
- prove_year_gate.py and prove_reconcile.py delete bill rows; I believe they carry dev/scratch-database guards like the other scripts in server/scripts, but I did not open them to confirm — if either can be pointed at the live database, its DELETE is itself an uncorrectable write violating hard rule 5.
- markSynced and markVoidApplied write WHERE id = ? with no state predicate; I believe claimForSend's conditional UPDATE makes a competing writer impossible on the send path, but I did not enumerate every caller of markVoidApplied to prove the void path has an equivalent claim (applyVoids uses only the in-process inFlight set, not a durable claim).
- master.py's header route table (lines 3-11) omits the eight POST .../activate and .../deactivate routes the module defines; not refuted-wrong (it claims no exclusivity) but a reader scanning the table undercounts the write surface
- 'JWT_TTL_SECONDS is 3600 and there is no refresh token' is stated as fact in users.py:19, migration 0005:9 and 0007:26; it is true of the DEFAULT only — config.py:85 reads it from the environment, so a deployment overriding it silently falsifies three docstrings' arithmetic about exposure windows
- migration 0006:40-43 claims 'mobile has one account (app/config.ts holds hardcoded DEMO credentials and App.tsx has no TextInput at all)'; mobile/ is outside this task's scope so I did not verify the current mobile tree, but mobile/src/session/signOut.ts:338 still references 'the hardcoded DEMO credentials', so the claim may or may not have rotted — flagged for the mobile-scope pass rather than asserted either way
- migration 0009's stale-debt passages (finding above) are in a migration docstring, which this project treats as pinned to its create date; the finding stands because the claims are written in the present/future tense ('WILL REPORT', 'today selects') with no supersession note, which is exactly the form CLAUDE.md's pin-to-a-commit convention says rots invisibly
- The onSignOut stale-count finding's dangerous direction (stale 0 while true count > 0, permitting a sign-out over an unsent bill) appears unreachable from today's state transitions — every path that raises ownUnsentCount from 0 also changes pendingCount — but I enumerated transitions by reading, not by proof, so this is a belief.
- refresh() runs four listByState queries plus unsentBreakdown plus pendingQueueSnapshot every 400ms; on a low-end handset with a large bill table this may be a perceptible load, but nothing was measured.
- engine.ts:444's 'about every four seconds' and types.ts:353's 'every 4-second pass' read as facts about the engine, but the cadence belongs to App.tsx:833; if the engine were rehosted (e.g. desktop), those comments would quietly describe the wrong system.
- The two intervals at App.tsx:724 (refresh, 400ms) and the FORM_DEBOUNCE_MS at :141 (400ms) are coincidentally equal; a reader could infer a relationship that does not exist.
- The void-overwrite race window (finding 1) is the duration of the first void transaction, likely milliseconds; hitting it needs two near-simultaneous admin void requests on one bill, so I judge occurrence rare — but I did not measure the window and both requests answering 200 means an occurrence would leave no error anywhere.
- A React Native fetch without an AbortController may still be terminated by OS-level socket timeouts, which would eventually release the refreshingRef latch (finding 4); I did not measure RN's actual behavior on this project's builds, so 'wedged indefinitely' is the worst case, not a measured one.
- Many of the asymmetries carry in-code rationales (void-queue no-backoff is called out in engine.ts and httpTransport.ts; the users-list auth break, the login timing order, and the shop-code non-validation are argued in their docstrings). I reported them as asymmetries per the brief without judging the rationales; the ones with no written rationale anywhere I could find are findings 1, 2, 8, 13, 14, 15, 17 and 18.
- Finding 14 (unbounded login password reaching argon2) is live today but is an availability concern, not a wrong-result or lost-money mechanism, which is why it is banded C rather than A under this brief's band definitions.

## What was NOT read, and why

Coverage is the union across eight agents plus the inline verification pass,
and it is partial by design — each agent read deeply along its own axis and
listed everything else as unread. The honest whole-tree statement:

**Read in full by at least one pass:** server/app (bills, main, db, config,
auth, security, clock_guard, seeddata, master, reports, users, directory), all
9 migrations, 00_init_roles.sql, backup_db.py, restore_db.py, reconcile.py,
provision_shop.py, seed_dev.py, reset_clock_watermark.py, both tools/ scripts,
mobile App.tsx, engine.ts, types.ts, queueHealth.ts, clockSanity.ts,
rowOwner.ts, money.ts, shopTime.ts, parkedReason.ts (large parts),
httpTransport.ts, signInIdentity.ts, four server proofs (auth, rls, bills,
reconcile) and the docstrings/heads of every other proof and every file in the
map (163/163 mapped from at least a head read).

**Never read in full by anyone:** the bodies of 13 of 17 server proofs and 23
of 24 mobile proofs beyond docstrings, import maps and targeted greps — so
“what each proof exercises” rests on unusually candid docstrings plus
route-string greps for those, as the opinions list flags; most mobile/app/
screen bodies (mapped, selectively read); SqliteMasterStore, SqliteShopStore,
SqliteIdentityStore, driver/mutex/nodeDriver bodies; dailyView.ts and
statusNotice.ts bodies beyond targeted ranges; both lockfiles and all binary
assets (definitional); mobile/metro.config.js and tools/finish-build.mjs
bodies. A finding that would live only in one of those bodies is a finding
this audit cannot have made. desktop/ contains nothing to read.

The raw per-agent unread lists (140 entries, overlapping) are preserved in the
session scratchpad beside the workflow transcript, not restated here.

---

# Appendix A — the map (163 tracked files, one line each)

## server+tools+desktop

- `desktop/.gitkeep` — Empty placeholder keeping the desktop/ directory in git; no Electron code exists yet.
- `server/.env.example` — Template for server/.env: three role-separated DB URLs (owner/migration, RLS-subject app, directory reader) plus JWT_SECRET (no default, app refuses to start) and JWT_TTL_SECONDS=3600.
- `server/.gitignore` — Ignores the local uvicorn dev-server log files (.uvicorn.out.log / .uvicorn.err.log).
- `server/.gitkeep` — Empty placeholder file (predates the real server code; now redundant).
- `server/README.md` — Server overview and local setup: running API status (login, bills CRUD-minus-delete, master data reads), docker/uv setup steps, proof-script list and the run-twice rule.
- `server/alembic.ini` — Alembic config; script_location=migrations, no DB URL stored (env.py reads MIGRATION_DATABASE_URL so the owner role runs migrations and no credential is tracked).
- `server/app/__init__.py` — Package marker with a one-line docstring for the server application package.
- `server/app/auth.py` — JWT auth dependency: get_principal resolves tenant+user+role from the bearer token only (never URL/body), re-checks token_version and is_active per request; defines the shared 401/403 refusal vocabulary and require_admin.
- `server/app/bills.py` — Purchase-bill router: atomic header+items create in one transaction, idempotency-key replay, server-side Decimal money recompute (client totals only rejected on mismatch), gap-free doc_no assignment, read/list, and void (422 permanent vs 424 resolvable rejection species).
- `server/app/clock_guard.py` — Distrusts the SERVER's now(): forward-only watermark (GREATEST in SQL) trips the API to 503 if now() falls >24h below the highest instant ever seen, protecting the per-BE-year doc_no counter from a backwards clock.
- `server/app/config.py` — Environment-loaded runtime config: SHOP_TIMEZONE (fixed UTC+7, the single server-side timezone authority for BE-year/doc_no/daily reports), the two runtime DB URLs, and JWT settings with fail-closed required secrets.
- `server/app/db.py` — Async engines and tenant_connection(): applies tenant context via SET LOCAL app.tenant_id inside a transaction (RLS fails closed when unset); separate directory_engine bound to the grant-contained directory reader role.
- `server/app/directory.py` — POST /auth/shop-code: pre-authentication lookup resolving a typed 8-char shop code to a tenant_id via the grant-contained directory role, with one indistinguishable refusal for unknown/malformed/over-long codes (anti-enumeration).
- `server/app/main.py` — FastAPI app assembly: lifespan, /health, POST /auth/login (timing-equalised, locked-account refusal, returns user_id + token), /whoami, mounts bills/master/reports/users/directory routers, clock-guard wiring.
- `server/app/master.py` — Master-data router: uoms/categories/products/sellers + price tiers — reads for any signed-in user (yard app caches offline), writes admin-only, no DELETE anywhere; retirement via is_active hides rows from pickers while historical reads still resolve.
- `server/app/reports.py` — GET /reports/daily (admin only): one shop-day money view over server_received_at converted to shop time, half-open day boundary, includes voids that GET /bills hides; carries its basis and Thai consequence text in the response.
- `server/app/security.py` — Argon2 password hashing and JWT issue/verify, dispatched to worker threads (CPU-bound); DUMMY_HASH equalises timing for missing users to prevent user enumeration.
- `server/app/seeddata.py` — Shared DEV seed identities (fixed UUIDs, dev-only passwords) for two tenants with admin+staff users and master-data fixtures, imported by seed_dev.py and the proof scripts.
- `server/app/users.py` — User-management router: GET /users roster, POST /users (admin creates account), revoke-sessions (token_version bump event), deactivate/activate (account state, revoking in the same UPDATE); no delete path.
- `server/db/init/00_init_roles.sql` — Re-runnable psql-only bootstrap for the dev cluster: creates the three runtime roles (owner/app/directory) with committed DEV passwords, the recycle database, and schema-level grants; runs once from docker-entrypoint-initdb.d.
- `server/docker-compose.yml` — Single-service local dev Postgres 16 (container recycle_pg, host port 5544), init scripts mounted read-only, named volume recycle_pgdata, healthcheck.
- `server/migrations/env.py` — Alembic async environment (asyncpg): loads .env and takes MIGRATION_DATABASE_URL so migrations always run as the owner role, never the app role.
- `server/migrations/script.py.mako` — Stock Alembic template for generating new migration files.
- `server/migrations/versions/0001_initial_schema.py` — Initial schema in raw SQL: tenants, master data, purchase bills/items — NUMERIC(14,2) money and (14,3) weight, composite (tenant_id,id) FKs, client-supplied bill UUIDs (no default), nullable doc_no with partial unique index, RLS on every business table.
- `server/migrations/versions/0002_bills_docno_and_vehicle.py` — Adds purchase_bills.vehicle_no, relaxes item grade to nullable, and creates doc_no_counters — a per-(tenant, be_year) row-locked counter giving gap-free doc_no (deliberately not a sequence).
- `server/migrations/versions/0003_move_grade_to_sellers.py` — Drops grade from purchase_bill_items (schema-audit slip) and adds it to sellers, where SRS 1.6 says the price-tier grade belongs.
- `server/migrations/versions/0004_is_active_and_seller_identity.py` — Adds is_active (default true) to the four master-data tables for retirement-not-deletion, plus seller identity fields (id_number, address, vehicle_no).
- `server/migrations/versions/0005_users_token_version.py` — Adds users.token_version: minted into every JWT and re-read per request, so bumping the row revokes all previously issued tokens without deleting anything.
- `server/migrations/versions/0006_bills_created_by.py` — Adds purchase_bills.created_by — the principal of the submitting POST /bills session (not necessarily the weigher); non-retroactive, existing bills stay authorless.
- `server/migrations/versions/0007_users_is_active.py` — Adds users.is_active so an account can be LOCKED (dismissal), refused at both login and get_principal; complements 0005's session-only revocation.
- `server/migrations/versions/0008_server_clock_watermark.py` — Creates server_clock_watermark backing the clock guard; REVOKEs INSERT/DELETE from the app role so only forward-only UPDATE (GREATEST) remains and reset requires the owner role.
- `server/migrations/versions/0009_directory_shop_codes.py` — Creates schema directory and directory.shop_codes (typed shop code -> tenant_id) with a SELECT-only reader role grant; adds no code path — the lookup endpoint came separately.
- `server/pyproject.toml` — Server package metadata and dependencies (SQLAlchemy async, asyncpg, alembic, FastAPI, uvicorn, PyJWT, argon2-cffi, httpx); Python >=3.12.
- `server/scripts/BACKUP.md` — Operator runbook for backup_db.py / restore_db.py and the round-trip proof; scope is the local docker Postgres, the only deployment today.
- `server/scripts/backup_db.py` — Dumps the money database to plain files on the host outside the docker volume, running pg_dump inside the container so dump and server versions can never drift.
- `server/scripts/build_all_lessons.py` — Generates/verifies lessons/all-lessons.md through ONE build function (--write / --check), all IO in bytes with pinned UTF-8 and LF to dodge the box's cp874 locale.
- `server/scripts/prove_auth.py` — Phase 1b proof: exercises login, whoami and the per-request tenant-context layer over real HTTP against a seeded live server.
- `server/scripts/prove_backup_restore.py` — Proves the backup round trip end to end, defeating vacuity by mutating the source after the dump so the restore must reflect the dump's moment, not the live database.
- `server/scripts/prove_bills.py` — Phase 1c proof: bill create/read/void over real HTTP including deterministic doc_no assignment, idempotency replay and concurrent submits (threads).
- `server/scripts/prove_clock_guard.py` — Proves the clock guard red-then-green in one run by raising the watermark from an owner connection (arithmetically equivalent to lowering now(), which cannot be moved on a shared container).
- `server/scripts/prove_daily_report.py` — Proves GET /reports/daily: both day-boundary edges in shop time, plus DISPROOFS — the same fixtures totalled the two wrong ways (UTC day, device_created_at day) with the wrong numbers printed beside the right one.
- `server/scripts/prove_docno_clock.py` — Proves doc_no's BE year and server_received_at derive from ONE instant by lying to Python's clock across the Buddhist new year; refuses to run against the live database.
- `server/scripts/prove_master.py` — Proves the master-data read endpoints over real HTTP: cross-tenant invisibility and money crossing the wire as strings.
- `server/scripts/prove_master_data_gate.py` — Proves the 422-permanent vs 424-resolvable rejection species: the same bill (same id and idempotency_key) goes through once the missing price/grade appears — no re-weigh, no duplicate.
- `server/scripts/prove_master_write.py` — Proves the admin role gate (403 distinct from 401/404/422/424) and the master-data write/retire API over real HTTP with a real staff token on the refused side.
- `server/scripts/prove_reconcile.py` — Injects one invariant violation at a time into a restored scratch copy, runs reconcile.py as a subprocess, and asserts the right check fires by name and clears when undone.
- `server/scripts/prove_revocation.py` — R1a proof that the server can refuse a token it already issued: token_version bump ends live sessions over real HTTP.
- `server/scripts/prove_rls.py` — Phase 1a proof: connects as the RLS-subject app role and proves cross-tenant reads/writes are impossible and an unset tenant context sees zero rows (fails closed).
- `server/scripts/prove_seller_pricing.py` — Proves the seller is per-bill and their grade selects the stored list_price tier (same product, three grades), plus the two 424 park states for missing grade/price.
- `server/scripts/prove_shop_code.py` — Proves POST /auth/shop-code over real HTTP against scratch databases only (it writes a directory fixture row), launching its own uvicorn with URLs passed via child environment, and proves login is unchanged.
- `server/scripts/prove_shop_time.py` — Proves doc_no's Buddhist-era year derives from the shop's UTC+7 date rather than UTC's, closing the seven-hour wrong-year window either side of new year.
- `server/scripts/prove_user_create.py` — Proves POST /users over real HTTP (admin creates a working account); scratch-only because user rows have no delete path.
- `server/scripts/prove_year_gate.py` — Proves the year-boundary gate by fabricating doc_no_counters rows on scratch so the current be_year lands at max+1/max+2/below-max; never against dev.
- `server/scripts/provision_shop.py` — Operator (not application) script provisioning ONE shop: tenant row, first admin user, and shop code — requires the owner role, which alone can write directory.shop_codes.
- `server/scripts/reconcile.py` — Read-only invariant checker over a live database (doc_no gap-free, totals equal lines, tenant-consistent references, etc.); exit 0 clean, 1 violation, 2 could-not-check — deliberately distinct.
- `server/scripts/reset_clock_watermark.py` — Owner-role operator script to clear a tripped clock guard — deliberately a separate manual act, since the app role cannot lower the watermark and a restart must not clear a trip.
- `server/scripts/restore_db.py` — Restores a backup_db.py backup into a database — scratch verify by default; overwriting the live database requires an explicit --overwrite-live flag.
- `server/scripts/seed_dev.py` — Idempotent DEV seeder: two tenants each with admin+staff users and master data (uoms, categories, products, prices, sellers), written as the app role under SET LOCAL tenant context like the runtime.
- `server/uv.lock` — uv-generated locked dependency versions for the server package (machine-written, 207,762 bytes).
- `tools/build_paste_set.py` — Copies the declared advisor-facing doc set out of the repo with a byte-hash manifest (--write) and detects drift against it (--check), so the pasted Claude-project copy is answerable.
- `tools/verify_citations.ps1` — PowerShell checker that every section/handle citation in the source docs resolves to exactly one place in its target file; -Source selects the corpus (defaults START_HERE.md + ARCHITECTURE.md), carries no citation list of its own.

*Mapper notes:* desktop/ confirmed to hold exactly one tracked file, desktop/.gitkeep (0 bytes) — measured_by: `git ls-files desktop/` returned only that path, and `wc -c` returned 0. server/ holds 58 tracked files, tools/ holds 2; every one is mapped above. Purposes were established by reading each file's head/docstring (15-60 lines each) — enough in every case because this codebase front-loads intent into module docstrings. Read-only audit: nothing was edited or executed beyond git ls-files and wc. Migration purposes are from their own docstrings; 0004's seller identity fields (id_number, address, vehicle_no) match CLAUDE.md's record of the same migration. This call covers TASK 1 (map) only — no risk-banded findings were requested in this task; none are asserted.

## mobile

- `mobile/.gitignore` — Ignores node_modules, dist, .expo, dev-server logs, and the generated android/ and ios/ native projects (regenerated from app.json by expo prebuild, never hand-edited).
- `mobile/App.tsx` — Root React component wiring everything together: cold-start restore (keystore token, SQLite master cache), per-bill seller choice derived from the draft, and composition of all screens, stores and the sync engine.
- `mobile/app.json` — Expo config: app name (Thai test label), android package dev.chutipon.recycle, sqlite/secure-store plugins, and extra.apiBaseUrl — the single server URL for the whole app (LAN address 192.168.1.238:8000).
- `mobile/index.ts` — Expo entry point: registerRootComponent(App).
- `mobile/metro.config.js` — Metro config teaching the bundler to resolve TypeScript ESM '.js' import specifiers (retry without extension), so one source tree compiles under both tsc/node and Metro.
- `mobile/package.json` — Single npm package for app + engine + proofs; scripts for the two disjoint typechecks (typecheck / typecheck:app), the node build, and 24 prove:* headless proof runners.
- `mobile/package-lock.json` — npm lockfile pinning the dependency tree (not opened; generated).
- `mobile/tsconfig.json` — The EXPO APP TypeScript program (strict, exactOptionalPropertyTypes); excludes src/proof and nodeDriver.ts — mirror of tsconfig.node.json.
- `mobile/tsconfig.node.json` — The NODE TypeScript program: engine, adapters, proofs compiled as ESM into dist/; excludes src/device (expo natives) to keep @types/node from clashing with RN globals.
- `mobile/tools/finish-build.mjs` — Post-build step writing dist/package.json {type: module} so the compiled proofs run as ESM while the root package stays CommonJS for Metro/babel.
- `mobile/app/BillsPanel.tsx` — UI: local bill list and the void entry point — voided bills stay visible with reason and doc_no; the void reason is the one free-text OS-keyboard field.
- `mobile/app/CartScreen.tsx` — UI: the multi-line cart screen — big tap targets, undoable line delete, confirmed clear-all, all numeric entry through the in-app pad; rules live in src/cart/entry.ts.
- `mobile/app/ConfirmSaveDialog.tsx` — UI: the app's one confirmation dialog, shown before saving a bill (the only irreversible action); a Modal so the total renders LARGE, includes pricing-provenance line.
- `mobile/app/ConfirmSellerChangeDialog.tsx` — UI: warning dialog when changing the seller on a non-empty cart, stating in numbers what moves and what does not (warning, deliberately not a block).
- `mobile/app/DailyScreen.tsx` — UI: the owner's daily-money screen — presentation only; content, order, wording and tone all come from src/reports/dailyView.ts. Layout argues prominence: total, understatement, voids, off-list, bill list.
- `mobile/app/LoginScreen.tsx` — UI: login screen with two states — one-time shop-code setup, then username/password sign-in; every sentence comes from src/session/shopCode.ts and signInIdentity.ts.
- `mobile/app/MasterDataStrip.tsx` — UI: always-visible strip showing how old the cached master data (prices) is; renders nothing when fresh; wording and tone from src/master/freshness.ts.
- `mobile/app/Numpad.tsx` — UI: in-app numeric keypad replacing the OS keyboard for gross/tare/price — no paste target, live readout inside the panel, keys append to a string via cart/entry.applyKey (never a JS number).
- `mobile/app/SellerPicker.tsx` — UI: seller search screen (name/code, plus plate search against plates THIS device recorded on previous bills — plates belong to bills, not sellers).
- `mobile/app/SignOutSheet.tsx` — UI: sign-out sheet, presentation only — maps SignOutCard.lines from src/session/signOutNotice.ts in order, adding no text of its own.
- `mobile/app/StatusStrip.tsx` — UI: always-visible sync/connection strip; wording decided by src/sync/statusNotice.ts; 'online' is derived from the last real send outcome, not a network API.
- `mobile/app/api.ts` — Thin HTTP client for reads (products, sellers, daily report, shop-code exchange, login); bill submission does NOT go through here; every price stays a decimal string.
- `mobile/app/config.ts` — Single reader of app.json's expo.extra.apiBaseUrl; throws if absent. Notes the removal of the old hardcoded DEMO credentials (P1.7 step 6).
- `mobile/app/ids.ts` — Device UUID source (IdSource) over expo-crypto.randomUUID() — RFC4122 v4, chosen over an unverified Hermes global for idempotency keys.
- `mobile/app/messages.ts` — Thai UI strings for the validation codes produced by src/money/money.ts and cart.buildLine (codes stay headlessly testable; wording lives with the UI).
- `mobile/assets/android-icon-background.png` — Android adaptive-icon background layer (referenced from app.json).
- `mobile/assets/android-icon-foreground.png` — Android adaptive-icon foreground layer.
- `mobile/assets/android-icon-monochrome.png` — Android adaptive-icon monochrome layer.
- `mobile/assets/favicon.png` — Web favicon (Expo web target).
- `mobile/assets/icon.png` — App launcher icon.
- `mobile/assets/splash-icon.png` — Splash-screen image.
- `mobile/src/adapters/httpTransport.ts` — Production Transport over fetch (no RN/Expo); maps HTTP statuses to sync outcomes (201 accepted, 200 duplicate, 400/422 terminal, 424 resolvable, 401 session_expired, 403 forbidden, 5xx unavailable-reachable) — 'reachable' is the poison signal.
- `mobile/src/adapters/sqlite/SqliteDraftStore.ts` — Draft persistence and the one multi-statement transaction: promoting a draft into a pending bill (insert bill + clear draft, indivisibly). Money/weight columns are TEXT decimal strings.
- `mobile/src/adapters/sqlite/SqliteIdentityStore.ts` — Who this device is signed in as, kept in SQLite (not the keystore) so identity outlives the token and is reachable by headless proofs; never reconciled against the token.
- `mobile/src/adapters/sqlite/SqliteLocalStore.ts` — Production LocalStore (bill queue) over SQLite; every method is exactly one SQL statement, atomicity resting on conditional UPDATE rowcounts; exports BILL_INSERT_SQL and the owner-filter predicates.
- `mobile/src/adapters/sqlite/SqliteMasterStore.ts` — Master-data cache on disk (products with price tiers, sellers); each refresh is delete-all-then-insert-all plus timestamp in ONE transaction so a fresh stamp can never describe a partial list.
- `mobile/src/adapters/sqlite/SqliteShopStore.ts` — Which shop this device belongs to, kept in SQLite separate from the identity row because their lifetimes differ (sign-out vs device-leaves-shop); deliberately has no clear().
- `mobile/src/adapters/sqlite/driver.ts` — The minimal SqlDriver/SqlTx interface both drivers implement; SqlValue is string|number|null with deliberately no number path for money.
- `mobile/src/adapters/sqlite/mutex.ts` — Promise-chain mutex serialising ONE SQLite connection so no awaited statement can land between BEGIN and COMMIT on the async device driver.
- `mobile/src/adapters/sqlite/nodeDriver.ts` — SqlDriver over node:sqlite (real SQLite file on disk) — what the headless proofs execute; synchronous, Promise-wrapped to match the async interface.
- `mobile/src/adapters/sqlite/schema.ts` — Local schema and migration (initConnection). Money/weight live as TEXT inside payload_json because SQLite NUMERIC affinity would silently float decimal strings; documents why STRICT does not protect money.
- `mobile/src/cart/cart.ts` — Pure cart operations (Draft in, Draft out, no I/O): buildLine validation, totals via src/money, seller change impact — exactly the code the device runs, provable headless.
- `mobile/src/cart/draftNotice.ts` — Pure renderer of the sentence shown when a draft on this device belongs to somebody else — waiting must be visible, without naming who or blocking.
- `mobile/src/cart/entry.ts` — Pure entry-field safety rules: changing product clears stale weights (always gross, tare unless locked), Locks type structurally cannot lock gross, numpad key application (applyKey).
- `mobile/src/cart/sellers.ts` — Pure seller search/selection rules; the money rule: a grade-less seller gets NO default price (no silent fallback to tier A).
- `mobile/src/cart/types.ts` — Cart/draft model types: a draft is structurally NOT a bill (own tables, no UUID, no idempotency_key until promotion); DraftForm keeps raw text as typed.
- `mobile/src/device/expoSqliteDriver.ts` — SqlDriver over expo-sqlite — the DEVICE path; cannot run under node (native module); executes the identical SQL text the proofs proved; transactions differ from the node driver and the header says how.
- `mobile/src/device/secureTokenStore.ts` — TokenStore over expo-secure-store (OS keystore) — the device path; contract proven via MemoryTokenStore headless, clear() verified on a real iPhone (2026-08-06) and an Android debug build (2026-08-12).
- `mobile/src/master/freshness.ts` — Pure rules and wording for master-data cache age: how old the price on screen is, and the gate deciding whether the app may auto-fill a price from a stale cache (the money argument for offline pricing).
- `mobile/src/master/types.ts` — Pure device-side master-data shapes (MasterProduct, MasterSeller, MasterSnapshot, MasterStore) — structurally satisfied by app/api.ts types without importing them; prices are strings.
- `mobile/src/money/money.ts` — All client weight/money arithmetic: decimal.js ROUND_HALF_UP, strings in and strings out, digit-for-digit match with the server's Python Decimal formula; a JS number never touches money.
- `mobile/src/reports/dailyView.ts` — Pure rendering decisions for the owner's daily report (GET /reports/daily): every sentence, order and tone the DailyScreen shows, so the proof enumerates the whole surface.
- `mobile/src/session/deviceRole.ts` — Pure JWT-claim reader for the ADVISORY role (render-only; the server re-reads the role from the users row on every request for authorisation).
- `mobile/src/session/rowOwner.ts` — Pure RowOwner type and the read-live-at-every-write ordering: the identity is read from the store at each bill write, never cached.
- `mobile/src/session/shopCode.ts` — Pure shop-code exchange logic and its wording: POST /auth/shop-code, one undifferentiated 404 for every refusal, classification proved headless.
- `mobile/src/session/signInIdentity.ts` — Pure sign-in ordering and classification: the identity row is written ONLY after the server accepted the credentials; wrong password vs unreachable server are distinct answers.
- `mobile/src/session/signOut.ts` — Pure sign-out logic: a client-side clear (token deleted, shop kept), deliberately not calling the server revoke endpoint.
- `mobile/src/session/signOutNotice.ts` — Pure single renderer for the whole sign-out sheet — one SignOutCard whose lines array IS the draw order, so a proof joining lines reads exactly what the operator reads.
- `mobile/src/session/tokenStore.ts` — TokenStore interface plus the in-memory implementation the proofs use; documents the deliberate reversal from token-in-React-ref to token-in-keystore (2c-8).
- `mobile/src/sync/createBill.ts` — Pure local-first bill creation: build the LocalBill (UUID, idempotency_key, owner, timestamps) and write it to the LocalStore; saved means local, network is someone else's job.
- `mobile/src/sync/engine.ts` — The sync engine itself — pure TypeScript importing only ./types.js and clockSanity; strict head-of-line send loop, claim/backoff, void application; runs identically on device and under proof fakes.
- `mobile/src/sync/index.ts` — Barrel re-exporting types, engine and createBill.
- `mobile/src/sync/parkedReason.ts` — Pure mapping from a 424 resolvable-refusal code to the Thai sentence a PARKED bill shows — never an error tone, never the raw server body, unknown codes still readable.
- `mobile/src/sync/queueHealth.ts` — Pure queue-health judgement: given a queue snapshot and the time, distinguishes a POISONED head (reachable server refusing one bill — call support) from an OFFLINE backlog (wait); describes, never skips.
- `mobile/src/sync/statusNotice.ts` — Pure decision of what the status strip says — one ordered branch list (session expired, forbidden, poisoned, offline, pending, ready), moved out of app/ so proofs can assert on the wording.
- `mobile/src/sync/systemClock.ts` — Production Clock implementation (new Date / setTimeout); injected so proofs substitute FakeClock with virtual time.
- `mobile/src/sync/types.ts` — All sync-layer contracts: SyncState, LocalBill, BillPayload (money as strings), LocalStore, Transport, Clock, IdSource, QueueSnapshot, SendOutcome/VoidOutcome interfaces the engine depends on.
- `mobile/src/time/clockSanity.ts` — Pure rule for distrusting stored instants from a device clock that moved: an instant outside the window the writer could have produced is evidence of clock movement — believe the bound, not the stamp (caps send scheduling).
- `mobile/src/time/shopTime.ts` — Pure shop-local (not device-local) date/time formatting and Buddhist-era year — the one place a timezone and year are computed on the client; no Intl.
- `mobile/src/proof/cartCrashChild.ts` — Proof helper: child process SIGKILLed before/after COMMIT inside the real SqliteDraftStore.promoteToBill, for proveCart C5's crash-atomicity check.
- `mobile/src/proof/claimWorker.ts` — Proof helper: one racing claimer in a real OS worker thread with its own SQLite connection, calling the production claimForSend, for the sqliteProof race test.
- `mobile/src/proof/draftCrashChild.ts` — Proof helper: child SIGKILLed the instant a draft save() returns, for proveSeller S6's force-quit-survival check.
- `mobile/src/proof/fakes.ts` — Test doubles for the headless proofs: InMemoryStore, FakeClock, fake transports, FakeServer — explicitly not production code.
- `mobile/src/proof/fileServer.ts` — Proof helper: a FakeServer whose state lives in a JSON file so it outlives a SIGKILLed child (proveVoid V4); mirrors the Phase 1c idempotency/void contract.
- `mobile/src/proof/harness.ts` — Proof harness letting the Phase 2a case suite run unchanged against either the in-memory store or real SQLite — cases must not know which store they are on.
- `mobile/src/proof/migrationCrashChild.ts` — Proof helper: child SIGKILLed after N statements inside the real schema.initConnection, for proveMigration M2's half-migrated-database check.
- `mobile/src/proof/proofDevice.ts` — Proof helper: seeds a signed-in identity into a proof database so owner-filtered queues select rows, while keeping the no-identity state producible for proveOwner.
- `mobile/src/proof/proveCacheTenant.ts` — Proof (prove:cachetenant): the master-data cache is bound to a tenant — another shop's list reads as ABSENT, never as STALE.
- `mobile/src/proof/proveCart.ts` — Proof (prove:cart): the multi-item cart and persisted draft against real SQLite files, including the C5 SIGKILL inside the draft-to-bill transaction.
- `mobile/src/proof/proveClock.ts` — Proof (prove:clock): a stored future next_attempt_at from a moved device clock cannot dam the head-of-line queue (reproduced on a device first).
- `mobile/src/proof/proveCold.ts` — Proof (prove:cold): cold start with the server unreachable (a real TCP port with nothing listening) — pick, weigh, save, queue; and what the app is willing to claim about a price.
- `mobile/src/proof/proveDaily.ts` — Proof (prove:daily): every sentence and branch of the owner's daily-money rendering in src/reports/dailyView.ts.
- `mobile/src/proof/proveDraftOwner.ts` — Proof (prove:draftowner): a draft is not handed to, adopted by, or destroyed for a person it does not belong to — the READ side proveOwner never exercised.
- `mobile/src/proof/proveEntry.ts` — Proof (prove:entry): entry-screen safety rules, exhaustive over all lock-state combinations (pure logic, no database).
- `mobile/src/proof/proveForbidden.ts` — Proof (prove:forbidden): a 403 is classified as 'this account may not do this', not as unavailable — the staff-phone-taps-void path, driven against the real API.
- `mobile/src/proof/proveLogin.ts` — Proof (prove:login): a refused password, an unreachable server, and a 200 with no token are three different answers, against a real API.
- `mobile/src/proof/proveLoginScreen.ts` — Proof (prove:loginscreen): two real accounts in one shop on one device — the first time ownership mechanisms run with server-issued rather than invented identities.
- `mobile/src/proof/proveMigration.ts` — Proof (prove:migration): the schema migration is atomic under a real mid-migration SIGKILL, the identity outlives the token, and login records identity only on server acceptance.
- `mobile/src/proof/proveMoney.ts` — Proof (prove:money): the client's decimal math agrees digit-for-digit with the server's Python Decimal formula (expected values generated by running the server's own formula).
- `mobile/src/proof/proveNotice.ts` — Proof (prove:notice): what the operator reads on the bill card in every state — the anti-'correct classification rendered as an error' proof.
- `mobile/src/proof/proveOwner.ts` — Proof (prove:owner): the owner pair is stamped onto the bill row at creation, verified by SELECTing the row, not by watching the call.
- `mobile/src/proof/proveSeller.ts` — Proof (prove:seller): per-bill seller selection; S3 checks byte-for-byte that changing seller moves no already-quoted price; S6 is a real SIGKILL draft-survival test.
- `mobile/src/proof/proveSendOwner.ts` — Proof (prove:sendowner): the send queue selects only rows owned by the signed-in user — two identities in the SAME tenant, so a tenant-only filter would fail.
- `mobile/src/proof/proveSignOut.ts` — Proof (prove:signout): ending a session spans token store, engine gate, SQLite draft, and what the operator reads — all four layers in one lifecycle event.
- `mobile/src/proof/proveStatusCounts.ts` — Proof (prove:statuscounts): the three numbers on the status strip are true — pending counts gained the owner filter the send queue already had.
- `mobile/src/proof/proveSync.ts` — Proof (prove:sync): the Phase 2a adversarial engine suite — bills the server accepted === bills created, never fewer, never more.
- `mobile/src/proof/proveTime.ts` — Proof (prove:time): shop-timezone display and Buddhist-era dates — fixes the UTC-verbatim time slice and the Gregorian year on the bill card.
- `mobile/src/proof/proveVoid.ts` — Proof (prove:void): voiding a bill including one the server never saw; V4 SIGKILLs a child between 'bill synced' and 'void applied' against the file-backed server.
- `mobile/src/proof/proveVoidOwner.ts` — Proof (prove:voidowner): the void queue keys on the REQUESTER of the void, not the bill's owner — an admin's cancellation never routes to the staff member who weighed.
- `mobile/src/proof/proveVoidTerminal.ts` — Proof (prove:voidterminal): a permanently refused void stops being re-sent (observable: transport attempt count across passes), a transient one does not.
- `mobile/src/proof/sqliteProof.ts` — Proof (prove:sqlite): Phase 2b invariants that were free on a JS Map and are not on a database — including the claim race under four real OS threads on one file.
- `mobile/src/proof/voidCrashChild.ts` — Proof helper: child running one real sync pass and SIGKILLing itself at the exact instant between bill-synced and void-applied, for proveVoid V4.

*Mapper notes:* Directory roles, measured from tsconfig boundaries and file headers: app/ is the UI (React Native components plus api.ts/config.ts/ids.ts/messages.ts) and is explicitly outside the proven surface — repeated header convention "this file decides nothing", with all wording/classification pushed into src/. src/ minus src/proof and src/device is the ENGINE and pure-logic layer (sync/, cart/, money/, master/, session/, reports/, time/, adapters/) — pure TypeScript compiled two ways (tsc into dist/ for node proofs, Metro for the app bundle), which is why imports carry ".js" extensions and metro.config.js strips them. src/proof/ holds the 24 headless node proofs plus their crash-injection children and fakes; they run real SQLite files via node:sqlite, real SIGKILLed child processes, and real OS worker threads. src/device/ is the two Expo-native adapters (expoSqliteDriver, secureTokenStore) that cannot run under node and are excluded from tsconfig.node.json; src/proof and nodeDriver.ts are symmetrically excluded from the app program (tsconfig.json). Two disjoint TypeScript programs is a boot-check requirement in CLAUDE.md: both typechecks must run. Hard-rule mechanics observed while mapping (not a full audit — that is a separate task): money/weight are decimal strings end to end (schema.ts stores them as TEXT inside payload_json because SQLite NUMERIC affinity floats them; money.ts uses decimal.js ROUND_HALF_UP matching the server); UUIDs/idempotency keys minted at draft promotion via expo-crypto; voids are local flags synced to the server, never deletes; owner/tenant filtering is client-side per-row (RowOwner) with dedicated proofs (proveSendOwner, proveVoidOwner, proveCacheTenant, proveDraftOwner).

