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
- **A half-finished cart surviving a change of USER — `R5`'s question,
  not `R1b`'s** — sign-out deliberately LEAVES the open draft in SQLite
  (`local_draft`), and R1b proves it is still there afterwards rather
  than assuming it. That is right today: a draft is one un-promoted
  weighing, nothing is money until `promoteToBill` runs, and clearing it
  would be the single place sign-out destroys work. *Not done:* the
  question only becomes real when a DIFFERENT person can sign in, and
  today they cannot — `signIn()` uses the hardcoded DEMO credentials in
  `mobile/app/config.ts`, so signing out and back in returns the same
  account. *Unblocks:* `R5` (real per-shop accounts) deciding whether a
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
- **A day view on the desktop — `R7`, after a shop is running** — the
  daily money screen exists on the phone only, so an owner who works
  from a PC cannot see the day's takings there. *Not done:* `desktop/`
  is empty. *Unblocks:* same decision as the master-data screens.

## Verification gaps — built, not proven

- **~~The 403 rendering on the daily money screen has never been drawn
  on a device — `R2`~~ — CLOSED 2026-08-06.** It was drawn, under a staff
  session on a real iPhone — which R1 made possible for the first time,
  because the Keychain token could finally be discarded. **The record is
  the dated entry in `PROJECT_STATUS.md`'s Baseline observations
  (2026-08-06 device pass, R2 item 1), and is deliberately NOT restated
  here:** two copies drift, and a new session believes whichever it reads
  first. **The limit the observation states about itself travels with
  it** — the uvicorn lines carry no timestamps, so the 403 is tied to the
  screenshot by SOURCE ADDRESS and by being the only 403 in the log, not
  by clock. *Why it was blocked, kept because it is the reason for the
  ordering:* the phone could not be made to hold a staff session, the
  token living in the iOS Keychain and surviving deletion of the app —
  the same mechanism wearing a friendlier face, and half the reason
  sign-out was the first step rather than a later one.
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
- **~~`prove_reconcile.py`'s injection COUNT is recorded two different ways~~ —
  SETTLED 2026-08-07 in P1.10: it is 19.** Measured three ways — the header
  prints `injections (19)` from `len(injections)`, 19 constructors stand in
  `build()`, and `aa0a5d5`, the only commit that has ever touched the file, also
  holds 19. `PROJECT_STATUS.md`'s single "23" is corrected there. **No reason for
  the 23 is recorded anywhere, deliberately:** a reconstruction that fits
  arithmetically is not a recovered reason, and an invented one would be
  indistinguishable a year from now from a reason somebody actually had. The text
  below is left standing as the record of the discrepancy.
  The script's own run header prints
  `=== injections (19) ===`, and the 2026-08-02 entry in `PROJECT_STATUS.md`
  agrees with it ("118 assertions, 0 failures, 19 injections"). The 2026-08-07
  `created_by` entry says "Every money injection passed across **23**
  injections". Re-observed 2026-08-07 across three runs against a scratch copy
  restored from the post-0006 dump: the header reads **19**, with 113 `[OK]` /
  4 `[FAIL]` every time. *Not done:* deliberately NOT chased — it is a
  documentation discrepancy with no money consequence, the four failing cells
  are tracked in the entry above, and every injection about money passed in all
  three runs. *Unblocks:* nothing.
  **`ROADMAP.md § STAGE 1` "Deriving the three expectations" is where it
  gets settled**, because that step has to read the injection list anyway to
  derive the three counts that expired in the rebuild; whoever is in there
  should count the injections and correct whichever number is wrong.
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

## Code debt found and left in place

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
- **Four open questions carried by `ROADMAP.md` rather than this list**,
  because each one moves a step rather than adding an item: does the
  pilot shop need a printed slip on day one (if yes, printing and the
  desktop scaffold move onto the critical path and the whole order
  changes); where master-data screens live; who creates a shop's first
  admin; and whether the second-hand goods act's answer needs to arrive
  before real data accumulates under the current schema.
  