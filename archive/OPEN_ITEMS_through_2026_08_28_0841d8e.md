# Open items — archive

Closed, resolved and superseded entries moved out of `OPEN_ITEMS.md` in the M2
document compression, 2026-08-28. Every entry below stood in `OPEN_ITEMS.md`
VERBATIM through commit `0841d8e`, with its own dates, and is kept here so the
queue's history is not lost. **Nothing here is outstanding** — an item in this
file is closed, resolved or superseded; the live queue is `OPEN_ITEMS.md`. This
file is the index of its own contents. Order below is the order these entries
had in `OPEN_ITEMS.md`.

Corrections to this file: supersede and date, never rewrite.

---

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
  **CORRECTED 2026-08-12 — THE HEADLINE IS FALSE: BOTH HALVES ARE BUILT.** The
  *Unblocks:* above describes the mechanism as if it were owed, and it names it
  exactly: "a token version on the user row, bumped on password change or
  deactivation, checked where the role is already re-read on every request".
  That is what exists. **In source, read this pass:** `server/app/auth.py:217`
  calls `_require_live_session(token_version, row["token_version"])`, on the
  same query that re-reads the role. Built by `19a6b63`, with the account-lock
  guard added at `c9356a2` — both found by `git log -S "_require_live_session"`
  over the source, not by reading commit subjects. The client half exists too:
  `PROJECT_STATUS.md § What is NOT built` "SIGN-OUT — CLOSED by R1" records both
  halves observed on a real handset on 2026-08-06.
  **What is still true in the paragraph above:** there is no refresh token, and
  the one-hour expiry is the bound. **Nothing else in it is.** *Not done:*
  nothing. *Unblocks:* nothing.
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
  **`archive/ROADMAP_through_2026_08_28_9896041.md` "Deriving the three expectations" is where it
  gets settled** (P1.10, MET 2026-08-07, archived in M2 c2), because that step has to read the injection list anyway to
  derive the three counts that expired in the rebuild; whoever is in there
  should count the injections and correct whichever number is wrong.
- **THE RESERVE LEVEL IS DRAWN BUT SHOWN ON NO SCREEN — the continuous display is
  owed, blocked on the device holding no `target`. Recorded 2026-08-28 (P1.23
  c4), and it is not a defect.** `mobile/src/master/reserveNotice.ts` maps each of
  `reserveLevel`'s four values to its sentence and tone (proven by
  `prove:reservenotice`), and `reserveSurface(holding)` is the render composition
  a strip will call. Nothing renders it yet: `reserveSurface` needs a full
  `HoldingCounts`, and `target` arrives ONLY in a refill answer that `refillOnce`
  DISCARDS — `sellerRefill.ts`'s `refillOnce` saves the reservations and drops
  `holding.target`, and no device column holds it. Rendering a level without a
  real target would invent a number an operator acts on
  (`lessons/fallback-default-is-a-wrong-number.md`), so nothing is shown until the
  target is persisted. *Not done:* persist `target` and add the strip that reads
  it. *Unblocks / who owns it:* the NEXT unit — offline creation and `refillOnce`'s
  call site — because the reserve display and the code-spending it guards are the
  same wiring; the B1 legibility finding (shown continuously, before a refusal)
  lands with it.
  **UPDATED 2026-08-28 (offline-creation wiring, `94a0d47`): THE CODE-SPENDING HALF IS BUILT;
  THE STRIP IS STILL OWED, AND ONE PHRASE ABOVE IS CORRECTED.** Offline creation is
  now wired — the sheet writes a `local_sellers` row on every create and spends a
  reserved code (`App.tsx` `createSeller` → `SqliteLocalSellerStore.createLocalSeller`),
  and a refusal already shows the `exhausted`/`never_provisioned` wording BY CAUSE
  (`master/localSellerCreateNotice.ts`, `prove:localsellercreate`). What is still
  owed is the CONTINUOUS strip this item names. The phrase "the NEXT unit —
  offline creation and `refillOnce`'s call site" was imprecise on BOTH halves:
  `refillOnce` has had a call site since `48c422a` (`engine.ts:405`), and it does
  NOT discard its own answer — it RETURNS `holding.target`, and its caller
  `topUpReservations` discards the return value. So what commit 2 owes is to
  CAPTURE that return and persist `target`, then add the strip. See
  `PROJECT_STATUS.md § Current phase`'s dated correction.
  **DONE 2026-08-28 (reserve strip, commit 2). THIS ITEM CLOSES.** The continuous
  strip is built: `topUpReservations` (`engine.ts`) captures `refillOnce`'s answer
  and persists the `target` to a one-row `local_reserve` table; `mobile/app/ReserveStrip.tsx`
  renders `mobile/src/master/reserveStrip.ts` — the four states, the calm `ample`
  suppressed, a stale or clock-suspect target shown as the count and never as a
  sufficiency claim (`cached-master-data-is-a-price-claim`). Proven headless by
  `prove:reservestrip`, whose integration cell drives a real `SyncEngine.runOnce`
  — the refill call site no proof had driven. With it, P1.8b's DONE WHEN has NO
  CODE left: only the handset device pass and the scratch-DB server pass remain.
  NOT PINNED TO A SHA — ships in commit 2.
- **THE SAVE CONFIRMATION CONTRADICTS ITSELF — two boxes, two centimetres
  apart on one screen. Found 2026-08-17, NOT REPAIRED.** Both live in
  `mobile/app/ConfirmSaveDialog.tsx` and each is internally correct:
  - `:86-88`, red, rendered ONLY when the seller has no grade —
    `ผู้ขายรายนี้ยังไม่มีเกรด — บันทึกได้ แต่บิลจะค้างรอสำนักงานกำหนดเกรดก่อนจึงจะส่งเข้าระบบ`
  - `:99-101`, amber, rendered UNCONDITIONALLY —
    `บันทึกแล้วจะส่งเข้าระบบทันที แก้ไขไม่ได้ — หากผิดต้องยกเลิกบิลและออกใบใหม่`
  One says the bill will WAIT for the office before it enters the system; the
  other says that once saved it goes in IMMEDIATELY. The amber string is a
  constant with no `sellerGrade` in it, so **neither renderer knows the other
  exists** — the shape
  `lessons/correct-classification-can-still-render-as-an-error.md` was written
  for: one card, two renderers, each right on its own.
  *Consequence is MILD, and it is stated so nobody over-prioritises this:* the
  operator saves either way, and the status strip corrects the claim seconds
  later.
  **WHAT MUST SURVIVE INTO THE PLANNED UX REWORK IS THE STRUCTURE, NOT THE
  WORDING.** A rework that rewrites both sentences without knowing the cause
  reproduces the contradiction in new words.
  **RESOLVED 2026-08-27 — REPAIRED (P1.23 commit 1), BY CAUSE AND NOT BY
  WORDING.** Re-derived live first: the two boxes were still present and still
  contradicting, at `mobile/app/ConfirmSaveDialog.tsx:88-92` (red park, grade-
  conditional) and `:102-104` (amber warn, unconditional `ส่งเข้าระบบทันที`) — the
  record's `:86-88`/`:99-101` had rotted. THE CAUSE was that the "does the bill
  enter the system now" claim was baked UNCONDITIONALLY into the amber line while
  a separate conditional red line said the opposite. The decision now lives in
  the pure `mobile/src/master/saveConfirmNotice.ts`: that claim is DERIVED FROM
  THE GRADE (immediate for a graded seller; "waits, not sent yet" for a
  grade-less one, `:98`) and the irreversibility (`แก้ไขไม่ได้ — หากผิดต้องยกเลิกบิล
  และออกใบใหม่`) is the one thing shared by both. The claim it enters now is
  produced by ONE branch and the claim it waits by the OTHER, so the two can
  never appear on one card; the dialog renders what the module returns
  (`ConfirmSaveDialog.tsx:108`). Proven by `npm run prove:saveconfirm` (new,
  registered in `mobile/package.json`): it asserts the forbidden pairing
  NEGATIVELY over the concatenation in draw order, with the SHIPPED composition
  kept as a literal control (`contradicts()` fires on it — `enters=true
  waits=true`) and presence siblings against silence. Green twice, no reseed; the
  disproof (staging the shipped contradiction back into the module) reddened
  exactly S1's NEGATIVE and PAIRING cells, 2 of them, no neighbours. Both
  TypeScript programs exit 0.

- **THE `forbidden` SENTENCE PROMISES SOMETHING THE SYSTEM CANNOT DO — found
  2026-08-17, NOT REPAIRED.** `mobile/src/master/sellerCreateNotice.ts` tells
  the operator to have the shop owner open a permission for this account:
  `ต้องแจ้งเจ้าของร้านให้เปิดสิทธิ์ให้บัญชีนี้`. **There is no permission to
  open.** Measured in `recycle`: `users_role_check` is
  `CHECK ((role = ANY (ARRAY['admin'::text, 'staff'::text])))` — **two values,
  not a permission system.** The owner's only available move is to make that
  person an ADMIN, which grants voiding, pricing and user management wholesale
  — so the instruction asks for a granularity that does not exist and, taken
  literally, gets somebody over-privileged.
  *Not urgent:* the sentence is UNREACHABLE on this route today, because
  `POST /sellers` sits behind `get_principal` and no role is refused there, so
  nobody can currently be handed the wrong instruction. It is in the tree and
  it is wrong.
  *Not done:* the wording should speak of changing a ROLE rather than opening
  a permission, and must not promise a granularity the schema does not have.
  **RESOLVED 2026-08-27 — REPAIRED (P1.23 commit 1).** Re-derived live first: the
  sentence was still assembled and still shown — the `YARD_FORBIDDEN.admin_required`
  entry in `mobile/src/master/sellerCreateNotice.ts` built
  `ยังไม่ได้เพิ่มผู้ขายรายนี้ — ต้องแจ้งเจ้าของร้านให้เปิดสิทธิ์ให้บัญชีนี้` from
  `ASK_THE_OWNER` + `ให้เปิดสิทธิ์ให้บัญชีนี้`. The wording now names the ROLE the
  owner can set the account to, not a permission to open:
  `ต้องแจ้งเจ้าของร้านให้ตั้งบัญชีนี้เป็นผู้ดูแลระบบ` (`:174`). `ผู้ดูแลระบบ` is the
  server's own word for the admin role (`mobile/src/proof/fakes.ts`'s 403 body,
  `required_role: admin`). A fourth wording rule was added to the file, and
  `proveSellerNotice.ts` N6 now asserts, by cause, that `forbidden` names the ROLE
  (`ผู้ดูแล`) and does NOT promise `เปิดสิทธิ์`, with a literal control that the
  banned phrase is detectable. `npm run prove:sellernotice` green twice; the
  disproof (reverting the wording to the shipped `เปิดสิทธิ์`) reddened exactly
  those two N6 cells, no neighbours. Both TypeScript programs exit 0.
  **THE SIBLING IS NOT CLOSED — see the entry directly below.**

- **THE SAME `เปิดสิทธิ์` FALSE-PERMISSION PROMISE SURVIVES ON THE BILL-SEND 403
  PATH — found 2026-08-27 during P1.23 commit 1's sweep, NOT REPAIRED, and it is
  the CLASS of the entry above.** `mobile/src/sync/parkedReason.ts:546`
  (`SUBMIT_REFUSED.what`, line re-derived today) builds
  `บัญชีนี้ไม่มีสิทธิ์ส่งบิลเข้าระบบ — ต้องแจ้งเจ้าของร้านให้เปิดสิทธิ์` — the
  identical "open a permission" the two-value role schema cannot grant, one
  surface over (the send-path 403 notice on the bill card). The exact `เปิดสิทธิ์`
  phrase appears in EXACTLY these two sites across `mobile/` (measured today), so
  fixing only `sellerCreateNotice.ts` would be fixing the instance and leaving the
  class — this repo's named failure. It is a FOURTH screen, outside P1.23 commit
  1's stated three-screen scope, so it is SURFACED here rather than silently
  fixed (silently widening a scoped commit is the same failure from the other
  side). The `forbiddenReason` tables above it (`:340` `void_bill`, `:371`
  `daily_report`) are already clean: they say `ไม่มีสิทธิ์ทำ X — ต้องแจ้งเจ้าของร้าน`
  without promising a permission.
  *Not urgent:* like its sibling, this path is UNREACHABLE on today's server —
  `POST /bills` is open to staff
  (`lessons/403-is-about-what-the-caller-may-do.md`, "not reachable on today's
  server"), so nobody can currently be handed the wrong instruction.
  *Not done:* rewrite `SUBMIT_REFUSED.what` to name the ROLE (making the account
  an admin) rather than a permission, exactly as `sellerCreateNotice.ts`'s
  `admin_required` entry now does, and add the negative assertion (no `เปิดสิทธิ์`)
  where the send-forbidden card is proven (`proveNotice`, which already sweeps the
  forbidden card for owner-naming and the no-false-promise rule). The owner can
  fold it into P1.23's later consistency pass or authorise it as a follow-up to
  this commit.
  **RESOLVED 2026-08-27 (P1.23 commit 2) — THE CLASS SWEEP IS COMPLETE.**
  `SUBMIT_REFUSED.what` (`mobile/src/sync/parkedReason.ts:559`, re-derived) now
  reads `บัญชีนี้ไม่มีสิทธิ์ส่งบิลเข้าระบบ — ต้องแจ้งเจ้าของร้านให้ตั้งบัญชีนี้เป็นผู้ดูแลระบบ`
  — naming the ROLE (`ผู้ดูแลระบบ`), matching `sellerCreateNotice.ts`'s shape.
  Re-derived the site first: `grep -rn "เปิดสิทธิ์"` over `mobile/src`+`mobile/app`
  outside proofs returned EXACTLY this one production hit (the near-variant sweep
  `ให้สิทธิ์|มอบสิทธิ์|เพิ่มสิทธิ์|ขอสิทธิ์` found nothing; `ปลดล็อก` is the
  unrelated price-lock feature), so the class is now clean. The status strip
  (`statusNotice.ts`) never carried the promise; `priceEdit.ts`'s 403 and the
  `forbiddenReason` void/daily tables were already clean. `proveNotice` gained a
  class-wide NEGATIVE (no forbidden card contains `เปิดสิทธิ์`, 292 cells) plus a
  presence sibling that the send-refusal card names `ผู้ดูแล` (its 4 cells) and a
  literal control; green twice, and the disproof (the shipped `ให้เปิดสิทธิ์`)
  reddened exactly those two named cells on precisely the 4 send-refused cells,
  the 288 void cards staying clean. Both TypeScript programs exit 0.

- **~~A 422 HANDS THE REJECTED PASSWORD BACK TO THE CALLER, KNOWN AND OPEN.
  Measured 2026-08-10, shipped with the echo deliberately.~~ — CLOSED
  2026-08-10 by `app/main.py::validation_error_handler`, ONE COMMIT AFTER THE
  ONE THAT RECORDED IT.** The *Not done:* clause below is left standing and is
  now history rather than plan: it argued the fix was not the create route's
  business, and that argument is exactly why the fix is a handler registered
  against `RequestValidationError` on the app instead. **What was decided is
  the thing that clause said was undecided** — a validation refusal carries
  `type`, `loc`, `msg` and `ctx`, and never the submitted value; `detail`
  stays a LIST; and `input` is removed UNCONDITIONALLY rather than for a list
  of field names, so a field added later is covered by a decision already
  taken. **The order was deliberate:** D6's two password routes carry two
  secrets in one request, and fixing it at them would have left an API safe
  where somebody remembered and leaking where nobody did. Asserted on the RAW
  BYTES in `prove_user_create.py` P6/H4, with H1-H3 showing the removal is
  API-wide — H3 on `POST /uoms`, a route that has nothing to do with
  passwords. **One residual, and no handler can reach it:** a CUSTOM validator
  that interpolates the rejected value into its own message would still echo
  it through `msg`. Every constraint in this API is declarative today, so no
  such message exists; the rule for the day one is written belongs at the
  validator. **The record of the defect follows, unedited.** FastAPI's default
  validation handler serialises pydantic's `input`, so the value that failed the
  constraint comes back inside the error body. `POST /users` declares
  `min_length=8` on `password` at the edge — which is what
  `lessons/README.md § Lessons` "edge-must-reject-what-the-column-rounds.md"
  prescribes and what `master.py` already does — and a seven-character password
  returns `"input":"abc1234"` in the refusal that rejected it. The same run shows
  the same mechanism on a different rule: an `extra_forbidden` refusal echoes its
  field's value too. **Nothing in the route put it there**, and no line of this
  repository asked for it.
  **THE HAZARD IS THE BODY TRAVELLING, NOT THE ADMIN SEEING IT.** The disclosure
  is to the caller who just typed the value, so it is not a breach on its own.
  What makes it matter is that this project has already shipped a screen that
  rendered a raw server error body verbatim with a uuid in it
  (`lessons/README.md § Lessons` "correct-classification-can-still-render-as-an-error.md"),
  and a client that does the same with this body puts a colleague's new password
  on a screen at a weighbridge.
  *Not done:* **the fix is not this route's business.** Redacting `input` means a
  `RequestValidationError` handler for the WHOLE API — that is every endpoint's
  refusal shape changing at once, which is not a change to slip into the commit
  that found the defect, and it would land with no contract saying what a refusal
  body may carry. The proof therefore prints the echo as a labelled OBSERVATION
  and not as a cell, because a cell asserting a decision nobody has taken fails
  for being right too early. *Unblocks:* the owner deciding whether refusal bodies
  are contracted API surface; then one handler, and the sibling refusal-body
  assertions the verification-gap entry above asks for. **The two password routes
  D6 still owes will constrain a password the same way and echo it the same way
  unless this is remembered when they are written.**
- **A BILL WEIGHED IN THE PICKER'S SETTLE-TO-REFRESH WINDOW IS NOT PARKED AND IS NOT RELEASED.**
  Raised 2026-08-25 by P1.8b GATES while building the park. **The full record is
  AT THE CRITERION, deliberately, because a session building the rework reads the
  criterion and not this file** —
  `ROADMAP.md § P1.8` "HAZARD FOUND WHILE BUILDING THE PARK (P1.8b GATES, 2026-08-25) — CELL 4, AS".
  In one line: `THE-LOCAL-ROW-SURVIVES-A-REFRESH-THAT-DELETES` cell 4 REQUIRES the
  picker to keep offering a local seller after it has settled and before a refresh
  arrives, and a bill weighed in that window carries the local id, is not parked
  (the seller is already `synced`) and is released by nothing (the release fired on
  the settle, which has already happened) — so it reaches `POST /bills` and is
  answered 422, PERMANENT and terminal, for cash already paid. UNREACHABLE at
  `48c422a` only because no picker exists; it opens on the day cell 3 is built.
  THE DECISION is which repair: resolve the id at send time, run the release on
  every pass as well, or have the picker hand out the SERVER id once there is one.
  NOTHING IS AUTHORISED.

  **RESOLVED 2026-08-27 (B1): RESOLVE THE ID AT SEND TIME.** The owner's answer:
  the bill carries the local seller id and the sender swaps in the server id once
  it exists, so the picker may quote a seller mid-settle without a 422 ever
  reaching a terminal bill — the window is safe by construction. The same
  sentence lands at `ROADMAP.md § P1.23` "resolve the id at send time", where a
  builder reads it at the step. The paragraph above is left verbatim, as every
  supersession in this repo is.

  **BUILT 2026-08-27 (P1.23 c3).** `mobile/src/sync/resolveParkedSeller.ts` is the
  resolver: it mints a branded `ResolvedSellerId` only from a settled seller and
  un-parks a window bill on `bill_send.owed()`, and the picker union
  (`mobile/src/cart/pickerSellers.ts`) offers the seller mid-settle. Proven
  headless by `prove:pickerseller` (R2 drives the send path, U4 the window). NOT
  PINNED TO A SHA — it ships in the c3 commit.
- **A CRASH BETWEEN THE SELLER SETTLE AND THE BILL RELEASE STRANDS THE BILLS.**
  Raised 2026-08-25 by P1.8b GATES, which built both halves. Recorded against the
  design at
  `ROADMAP.md § P1.8` "THE CRASH WINDOW BETWEEN THE SETTLE AND THE RELEASE".
  The two writes are to DIFFERENT TABLES so no single statement covers them; a kill
  between leaves a `synced` seller with its bills still parked — visible, counted,
  not lost, and released by nothing, because a seller settles once.
  `lessons/README.md § Lessons` "sync-state-needs-startup-recovery.md — applies to any" and "nothing polls it, so a crash strands the record forever"
  is exactly this subject: an in-progress state nothing polls. THE DECISION is
  whether this design owes a startup sweep, and no existing `recover` looks for a
  bill parked behind a settled seller. NOTHING IS AUTHORISED.

  **RESOLVED 2026-08-27 (B1): YES, A STARTUP SWEEP IS OWED.** The owner's answer:
  recover a bill parked behind an already-settled seller. It is named as a FIFTH
  outstanding item in P1.8b's DONE WHEN — not one of the seller-kind criteria,
  owed before P1.8b closes. It is named at
  `ROADMAP.md § P1.8` "A FIFTH ITEM, AND IT IS NOT ONE OF THE SELLER-KIND CRITERIA".
  The sweep is DESIGN-authorised here and BUILT later; its shape is the lesson the
  paragraph above already cites. The paragraph is left verbatim.

  **BUILT 2026-08-27 (P1.23 c3), BY COMPOSITION.** "Later" is now. The sweep is the
  SAME `resolveParkedBehindSettled` finding 1's send path uses, reached at boot
  through `bill_send`'s `recover` — one function, two entry points, not a second
  mechanism watching for the settle. `prove:pickerseller` R3 drives it and R4 is
  its negative. NOT PINNED TO A SHA — it ships in the c3 commit.
- **A LOCAL SELLER HELD FOR REVIEW HOLDS THE SIGN-OUT GATE SHUT FOR EVER.** Raised
  2026-08-25 by P1.8b GATES, which widened the gate to every registry kind.
  Recorded against the design at
  `ROADMAP.md § P1.8` "A LOCAL SELLER HELD FOR REVIEW IS OWED AND NEVER ACTIONABLE".
  A 409 leaves the row counted by `owedCount` and outside `SELLER_ACTIONABLE`, and
  BOTH halves are required by criteria — so the gate refuses for ever under a sheet
  asking the operator to wait for something that cannot arrive. Conditional on an
  invariant violation the design holds unreachable, which is why it is a decision
  and not a defect. NOTHING IS AUTHORISED.

  **RESOLVED 2026-08-27 (B1): ACCEPTED AS UNREACHABLE.** The owner's answer: no
  build obligation, conditional on the invariant violation the design holds
  unreachable behind two server guards. **If that invariant ever becomes
  reachable, this reopens.** The paragraph above is left verbatim.
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
- **THE ADVISING SESSION'S PRE-SEND CHECKLIST IS NOT IN THIS REPOSITORY, so a
  new advising chat has no checkpoint at all — recorded 2026-08-12.** That
  session is the one role with no enforced path: this session has a reading
  order, a boot check and a `Prove:` block, and the advisor has none of them
  while reading the same files. On 2026-08-12 it made **four negative claims in
  one day**, each answered from the conversation rather than from a file, each
  refuted by one grep — the case is written up once, at
  `CLAUDE.md § Workflow` "A REPORT IS A CLUE", and is not restated here.
  *Not done:* the checklist lives in that chat's own instructions and nothing in
  this tree can see it, so nothing here can enforce it, verify it, or notice
  when it is missing. **Searched for with `pre-send`, `presend`, `checklist`,
  `before sending`, `before it answers`, `ninth item` and `nine items` over
  every tracked `*.md`: NOT FOUND WITH THESE WORDS** — which is the phrasing the
  ninth item itself requires, and is not the same claim as "it is not there".
  Only that ninth item is known in the tree; **the other eight have not been
  seen by anyone here and must not be invented**, which is why this is an entry
  and not a transcription. *Unblocks:* the owner deciding whether the checklist
  belongs in this repository at all — if it does, it is pasted in and
  `START_HERE.md § 2` points at it instead of recording its absence; if it does
  not, the standing instruction is that whoever opens an advising chat sends it
  with them, and that instruction has no home here either.
  **CLOSED 2026-08-16:** the owner decided it belongs in the repository,
  and it landed MEASURED rather than pasted — the remembered eight were
  treated as a clue and measured against the tree, and the drift that
  comparison surfaced is the finding
  (`lessons/README.md § Lessons` "a-rule-outside-the-repo-cannot-be-seen-to-drift.md").
  At `5ac22c3` the checklist is complete: four advisor-only items in
  `ADVISOR.md`, four shared checks mirrored with `CLAUDE.md` under
  `tools/verify_shared_checks.py`, the ninth by pointer — and it travels
  with the paste set, so the send-it-with-them instruction now has a
  mechanism instead of a memory.

- **MOVE THE ADVISING ROLE INTO AN IN-PROJECT TERMINAL SESSION — queued
  2026-08-16 by the owner, READY, not blocked.** It closes the residual the
  checklist work left: `ADVISOR.md` is on-demand delivery, and an
  in-terminal advisor loads it the way a coding session loads its files.
  The rationale is NOT restated here — it lives, measured, at
  `CLAUDE.md § Workflow` "moving the advisor into a terminal". The
  preconditions are met at `5ac22c3`: `ADVISOR.md` exists, the preamble's
  router routes the role by the ask, and the shared-four check holds the
  mirrored copies identical.
  **CLOSED 2026-08-17 — the move happened, and this entry is superseded
  rather than deleted.** The advising role has run as an in-project Claude
  Code session since 2026-08-16, the day the owner decided it: the decision
  and the boundary it runs under are written at
  `ADVISOR.md § 0. The boundary` "Decided by the owner 2026-08-16", and
  `e6a25dd` is the commit that landed them. What the role has since done in
  that shape is the evidence — it reads the tree live rather than a paste
  set, it dispatched the endpoint-versus-screen survey, and it wrote the
  briefs behind the 2026-08-17 report-language phase and this closure. The
  residual this entry was raised for is therefore gone by exactly the route
  it proposed: `ADVISOR.md` now loads the way a coding session's files
  load, instead of on demand. Kept in place because the argument for the
  move is also the record of why on-demand delivery was a risk at all.

- **A 422 handing back the value it refused** — recorded under
  `OPEN_ITEMS.md § Code debt found and left in place` **and CLOSED there on
  2026-08-10.** Re-derived in this pass: `server/app/main.py:94`
  `validation_error_handler` exists and `:90` names the removed key. This is not
  an outstanding gap.
