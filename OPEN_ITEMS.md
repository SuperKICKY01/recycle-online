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
  lists.** Migration 0009 (committed, NOT YET APPLIED to any cluster) creates
  `directory.shop_codes`, the first relation in this database outside
  `public`. Seven sites bound every structural check to that schema:
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
  0009 is applied, and two proofs go red with it.** 0009 (committed, NOT
  YET APPLIED to any cluster) creates `directory.shop_codes`, the first
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
  and still reads 0008 with a `directory` schema count of 0.
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
    3. **A quoted identifier in schema `public` ABORTS the backup rather than
       mis-keying it — no artefact is produced at all.** `live_row_counts`
       interpolates `public.{t}` UNQUOTED, so `public."Odd Name"` yields
       `... count(*) as n from public.Odd Name ...`. Measured 2026-08-09 by
       creating that relation in a scratch database and running the real tool:
       `BACKUP FAILED: psql failed (1): ERROR: relation "public.odd" does not
       exist`, exit 1, and **no `BACKUP_EXIT` line** — `fail()` calls
       `sys.exit(1)` before the print. **IT FAILS CLOSED, WHICH IS THE SAFE
       DIRECTION:** no dump, no manifest, nothing half-written that could later
       be trusted, and defects 1 and 2 cannot arise because nothing is written.
       **The danger is the MISSING EXIT LINE, not a corrupt backup** — a reader
       scanning for `BACKUP_EXIT=` finds nothing and can read that as output not
       yet arrived, which is the absence-is-the-signal shape `CLAUDE.md` records
       for `RESTORE_EXIT`. Consequence: such a database cannot be backed up by
       this tool at all.
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
  1. **`backup_db.py`'s three defects**, together and against a control that can
     distinguish them — the summary-versus-itemisation total, `copy_block_counts`
     mangling any identifier `pg_dump` had to quote, and `live_row_counts`
     aborting the backup outright on a quoted identifier in schema `public`. All
     three are described in full in the half-closed entry above; they are not
     restated here, because two copies drift. **This said TWO until 2026-08-09**,
     when a control pass measured the third.
  2. **The dev cluster to 0009.** `recycle` still reads 0008 with a `directory`
     schema count of 0, re-measured 2026-08-09. 0009 has been applied only to
     throwaways and to `recycle_tw20260809_0009fixture`, which survives under a
     stated DROP WHEN condition. Doing this BEFORE (1) means the first backup
     afterwards is the one that meets the unfixed writer.
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

- **`SRS_MAP.md`'s "Of the 34 `tenant_connection(` call sites in
  `server/app/`" is UNVERIFIED.** The line beneath it was corrected by the
  commit that records this, and the count above it was deliberately NOT
  measured while doing so — a number confirmed by silence is worse than one
  known to be unchecked. *Not done:* measuring it was outside that commit's
  scope, and fixing a number nobody has counted is how a wrong number gets
  an air of authority. *Unblocks:* one grep for `tenant_connection(` under
  `server/app/`, and either the count stands or it moves.
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
  therefore NOT evidence for splitting here. *Done when:* the file
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
  *Done when:* `:188-215` is rewritten against these measurements — BOM
  claim kept, working-tree claims kept, blob claims corrected — each
  with the instrument named, because the last two attempts at this
  paragraph disagreed about the answer and neither recorded how it was
  measured.
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
- **Four open questions carried by `ROADMAP.md` rather than this list**,
  because each one moves a step rather than adding an item: does the
  pilot shop need a printed slip on day one (if yes, printing and the
  desktop scaffold move onto the critical path and the whole order
  changes); where master-data screens live; who creates a shop's first
  admin; and whether the second-hand goods act's answer needs to arrive
  before real data accumulates under the current schema.
  