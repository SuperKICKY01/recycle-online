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
- **`prove_reconcile.py` is RED, and has been since the 2026-08-03
  rebuild — NOT caused by anything in R1a.** Three of its expectations
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
- **A stale comment cites a TypeScript config that no longer exists**
  (`mobile/src/device/expoSqliteDriver.ts`). *Not done:* comment only,
  nothing depends on it. *Unblocks:* one edit, whenever that file is
  next touched.
- **A malformed date on the daily report returns the framework's own
  422 shape**, not the `kind`/`code` error vocabulary the rest of the
  API uses. *Not done:* no client sends one yet. *Unblocks:* a validator
  on that parameter — small, and worth doing before a second client
  consumes the endpoint.

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
  *Not done:* nobody has decided what to keep. The directory has never
  been read by the owner, and this entry proposes nothing.
  *Unblocks:* an owner decision PER SKILL — keep, amend or delete — and
  a separate one on `settings.local.json`.

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
  