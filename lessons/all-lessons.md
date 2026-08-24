# All lessons (generated)

<!-- GENERATED FILE -- DO NOT HAND-EDIT. Your changes will be overwritten. -->

This file is `lessons/*.md` concatenated. Every edit belongs in the source
lesson file; anything written here is destroyed by the next run.

    regenerate   server/.venv/Scripts/python.exe server/scripts/build_all_lessons.py --write
    check        server/.venv/Scripts/python.exe server/scripts/build_all_lessons.py --check

`--check` rebuilds the document in memory and compares it against this file
byte for byte, with line endings normalised to LF on both sides first. It exits
1 on any difference. That is how a lesson edited without regenerating is caught.

**Sources:** 59 lesson files, `lessons/*.md`, ASCII filename order.

**Excluded:** `README.md` -- it is the index, not a lesson -- and this file.

**Amendments:** 23 across 13 files, counted from the source headings and
shown per entry in the table of contents below.

**No date field, deliberately.** No lesson file carries one and it cannot be
recovered from inside them. In this repo a date on a document means "this
decayed, re-run it before citing it" -- and a lesson is not a measurement, so it
does not decay that way. What travels here instead is the source filename and
the amendment count: information already present in the files.

**Heading levels are reproduced unchanged.** Amendment sections sit at `##`, the
same level as ordinary sections, so demoting `#` to `##` would push them to
`###` where they would be indistinguishable from `### Rider` and `### What
actually fixes it`. Entries are separated by a `---` rule and a `**SOURCE:**`
line instead of by heading depth.

## Table of contents

- `401-is-about-the-caller-not-the-bill.md` -- A 401 is neither unavailable nor rejected: the request was fine, the CALLER is no longer anyone
- `403-is-about-what-the-caller-may-do.md` -- A 403 is the fourth class: the caller is SOMEONE, and may not do this
- `a-backup-is-a-claim-until-it-is-restored.md` -- A backup is a claim until it has been restored
- `a-check-that-never-went-red-was-never-observed.md` *(2 amendments)* -- A check that has never gone red has not been observed
- `a-checker-must-not-share-the-code-it-checks.md` *(1 amendment)* -- A checker must not share the code it checks — and must not reach past it
- `a-column-that-describes-content-must-follow-a-rewrite.md` -- A column that describes the row's CONTENT must follow a rewrite; one that records its ORIGIN never may
- `a-control-must-contain-what-fooled-you.md` *(1 amendment)* -- A control must contain the thing that fools the counter
- `a-default-exit-code-is-a-default-verdict.md` -- A default exit code is a default verdict
- `a-defaulted-getattr-is-a-silent-dead-branch.md` -- A defaulted `getattr` is a silent dead branch
- `a-differential-control-is-only-as-good-as-its-weaker-side.md` -- A differential control is only as good as its weaker side
- `a-docstring-that-states-a-filter-is-a-claim-about-its-caller.md` -- A docstring that states a FILTER is a claim about its CALLER, and nothing checks it
- `a-gate-that-matches-a-keyword-misses-its-aliases.md` -- A gate that matches a keyword misses the engine's aliases for it
- `a-grant-boundary-belongs-to-a-database-not-a-role.md` -- A grant boundary belongs to a DATABASE, not to a role
- `a-green-cell-is-evidence-about-the-assertion-not-the-claim.md` *(1 amendment)* -- A green cell is evidence about the assertion, not about the claim
- `a-label-is-a-reference-with-no-checker.md` -- A label is a reference, and nothing in this repository checks one
- `a-lock-is-proven-by-what-waits-not-by-a-race.md` -- A lock is proven by what waits, not by a race
- `a-migration-stack-is-a-log-not-a-schema.md` -- A migration stack is a log, not a schema
- `a-mutation-on-a-protected-write-path-needs-a-scratch-database.md` -- A mutation on a protected write path needs a scratch database
- `a-narrowing-type-is-not-a-barrier-to-the-object.md` -- A narrowing type stops the FIELD being named, not the OBJECT being passed
- `a-platform-can-refuse-an-effect-and-record-it-as-done.md` -- A platform can refuse an effect and record it as done
- `a-proof-fixture-must-be-a-row-the-product-could-produce.md` -- A proof fixture must be a row the product could have produced
- `a-proof-must-establish-what-it-is-talking-to.md` -- A proof must establish WHAT IT IS TALKING TO before it asserts anything about the answers
- `a-quantified-sentence-names-no-member.md` -- A sentence that quantifies over a set names no member of it
- `a-refusal-hands-back-what-it-refused.md` *(1 amendment)* -- A 422 is a MIRROR — the framework hands back the value it refused, and one of those values is a password
- `a-report-is-many-reads-that-must-agree.md` -- A report is many reads; under READ COMMITTED they are many moments
- `a-round-trip-must-agree-on-its-key-space.md` -- A round trip must agree on its key space
- `a-rule-outside-the-repo-cannot-be-seen-to-drift.md` -- A rule outside the repo cannot be seen to drift
- `a-stored-future-instant-is-a-promise-about-a-clock.md` -- A stored future instant is a promise about a clock you do not control
- `a-value-comparison-cannot-prove-a-path.md` *(1 amendment)* -- A value comparison cannot prove a PATH
- `a-warning-in-one-file-does-not-protect-the-next.md` -- A warning written in one file does not protect the file beside it
- `an-error-is-one-branch-not-the-defects-shape.md` -- An error you observed is one branch, not the defect's shape
- `be-year-comes-after-the-timezone.md` *(2 amendments)* -- The BE year comes AFTER the timezone conversion — and an ISO-shaped BE date is a trap
- `cached-master-data-is-a-price-claim.md` -- A cached price is a claim about today, and a backwards clock makes it look fresh
- `concurrency-tests-need-a-barrier.md` -- A concurrency test without a start barrier proves nothing
- `config-defaults-must-fail-closed.md` -- A default for a security secret is a default IDENTITY
- `console-is-not-the-observation.md` *(1 amendment)* -- The console is not the observation — verify text at the source, in bytes
- `correct-classification-can-still-render-as-an-error.md` *(5 amendments)* -- A correct classification is not correct behaviour until the screen agrees
- `decimal-precision-for-domain-scale.md` -- Decimal precision must be set for the domain's scale, not left at the default
- `diagnosis-must-precede-the-fix.md` -- Diagnose before you fix: read the real error and the real files first
- `doc-no-is-arrival-order-not-event-time.md` -- doc_no is arrival order; device clocks are wrong. Report on server time.
- `edge-must-reject-what-the-column-rounds.md` -- Postgres ROUNDS to the column scale — so the edge must reject, or you ship a queue jam
- `fallback-default-is-a-wrong-number.md` -- A fallback default the server will refuse is a wrong number, not a convenience
- `login-resolves-under-tenant.md` -- Login resolves the user INSIDE tenant context
- `metro-file-map-nesting.md` -- When a resolver says a file is missing, ask the resolver — not the OS
- `opening-a-copy-is-a-write.md` -- Opening a copy is a write to it
- `printed-code-in-a-design-document-is-run-by-nobody.md` -- Printed code in a design document is run by nobody
- `proof-must-run-twice.md` *(5 amendments)* -- A proof that passes only once proves the environment, not the code
- `queue-jam-must-be-visible.md` *(1 amendment)* -- A strict ordered queue CAN deadlock. Don't skip the head — make the jam visible.
- `render-in-shop-time-not-device-time.md` *(1 amendment)* -- Store UTC, render in the SHOP's timezone — and never slice an ISO string
- `revoke-in-migration.md` -- Privilege changes live in the migration, not in a live one-off
- `schema-audit.md` -- Audit a migration field-by-field against the agreed schema before commit
- `set-local-per-request.md` -- Tenant context = SET LOCAL, per request, fail closed
- `sqlite-busy-timeout-first.md` -- PRAGMA busy_timeout must be the FIRST statement on a SQLite connection
- `sqlite-money-is-text.md` -- In SQLite, money columns are TEXT — and STRICT will not save you
- `sync-state-needs-startup-recovery.md` -- An in-progress state that nothing polls strands records forever
- `the-observer-is-a-writer-to-what-it-observes.md` -- The observer is a writer to what it observes
- `two-green-proofs-do-not-cover-the-seam.md` -- Two green proofs do not cover the seam between them
- `unavailable-is-not-rejected.md` *(1 amendment)* -- A failure to reach a verdict is not a negative verdict — and not every verdict is final
- `wait-for-the-event-not-the-ticks.md` -- A fixed number of ticks is not a synchronisation primitive

---

**SOURCE:** `401-is-about-the-caller-not-the-bill.md`

# A 401 is neither unavailable nor rejected: the request was fine, the CALLER is no longer anyone

Applies to every authenticated sync path. The send was well-formed, the server
answered promptly and definitively, and nothing about the payload is wrong —
but the token that identified us has run out. Classify that as either of the
existing failure classes and the app will tell the operator something false, in
one of two directions, decided by nothing more meaningful than how many bills
happened to be in the queue.

## What happened

`JWT_TTL_SECONDS` is 3600 and there is no refresh token, so on a long shift the
session simply ends. `httpTransport` mapped 401 into the catch-all with 5xx and
403: `{ kind: "unavailable", reachable: true }`. Every layer below then did
exactly what it was built to do, and produced two different lies:

| queued bills | what the machinery concluded | what the yard was told |
|---|---|---|
| 1 | `retryable > 0`, so App set `online = false` | **ออฟไลน์ — จะส่งให้เองเมื่อเน็ตกลับมา** |
| 3 | `reachable: true` ran `first_server_error_at` and `server_error_attempts` to `POISON_ALARM_ATTEMPTS` | **ติดต่อฝ่ายสนับสนุน** (red) |

The first says wait for signal. The network was fine — the server answered every
single request, which is precisely how we knew the token was dead. The second
sends someone to ring support about a jam nobody but the operator can clear.
**Neither names the fix, and the fix is one button.** Worse, the button did not
exist: the login screen renders on `token === null`, which is exactly false when
a token has expired rather than been absent.

## Why it fell through the existing classification

[[unavailable-is-not-rejected]] asks one question of every failed send:

> Can anything make this bill valid later — and does the failure name what?

That question has three answers there (unavailable / permanent / resolvable) and
it is the right question — for all three, because **all three are about the
bill.** A 401 is not about the bill. The bill is perfect; it goes through
untouched the moment someone signs in, which CASE 11d proves by sending the
byte-identical payload with the same idempotency key. The failure is about **the
caller**: we are no longer anyone the server will act for.

So the split was not too coarse this time, the way the two-way split had been.
It was measuring the wrong object. Ask the bill-question of a caller-problem and
every available answer is wrong:

- "nothing can make it valid" → terminal, and a perfectly good purchase is
  abandoned;
- "the outcome is unknown" → **false**. The outcome is known exactly;
- "master data is missing" → nothing the office can add will help.

**Rule.** Before choosing a failure class, ask *what the failure is about*: the
payload, the network, the server's state, or **the identity of the caller**. A
class that answers a question the failure is not an instance of will be wrong in
a way no amount of tuning fixes.

## The two properties that make this its own class

1. **It must not feed the poison alarm.** `first_server_error_at` and
   `server_error_attempts` exist to mean "the reachable server keeps refusing
   THIS BILL" ([[queue-jam-must-be-visible]]). A 401 refuses every bill equally,
   so it satisfies the letter of "reachable and refusing" while carrying none of
   the meaning. `markSessionExpired` clears both — a named store transition, not
   `markPendingAgain(reachable: false)`, because that parameter is documented as
   "did the server ANSWER" and for a 401 it did. Overloading it would have made
   the column lie about itself for the next person reading a metric off it.
2. **The message must carry its own action.** "Sign in again" is useless where
   there is no way to sign in, and the app's own login path was unreachable in
   exactly this state. The status strip now renders the button beside the
   sentence, and `StatusAction` pairs the label with the handler kind so the view
   cannot wire "ส่งอีกครั้ง" to the sign-in.

Do **not** solve this with refresh tokens. Re-login is the recovery for now, and
that is a decision, not an omission — but then the app owes the operator a
prompt and a button, which is the whole of this lesson's cost.

## Where it must NOT be applied

403. The MVP has no permission model, so a 403 from this server would be a
genuine surprise rather than a session that ran out; it stays `unavailable,
reachable: true`. And the transport's "no token at all" branch stays
transport-level — never having signed in is not the same event as being signed
out, even though the UI ends up saying much the same thing.

## Why every proof was green, again

For the same reason as [[correct-classification-can-still-render-as-an-error]]:
the wording lived in `app/StatusStrip.tsx`, and `app/` is unreachable from the
node program (`tsconfig.node.json` has `rootDir: "src"`). **Nothing that could
have failed existed.** The strip's ordered branch is now `src/sync/statusNotice.ts`,
which is the second time a rendering decision has had to move out of `app/`
before it could be trusted. Treat any operator-facing sentence still living
under `app/` as unproven by construction.

CASE 11 asserts the new behaviour AND runs the old classification alongside it
(`LegacyUnauthorizedTransport`, identical but for the union member it returns),
so the ledger shows `serverErrorAttempts=8, alarm=true, "ติดต่อฝ่ายสนับสนุน"`
next to `serverErrorAttempts=0, alarm=false, "ต้องเข้าสู่ระบบใหม่"` on the same
three bills. A green result is only evidence if you can see what would have made
it red.

## How to apply

1. Classify a failure by **what it is about** — payload, network, server state,
   caller identity — before deciding what to do with it. Add the class; do not
   stretch an existing one to fit.
2. Make the missed case a compile error: a new `SendOutcome` member breaks every
   `switch`, which is how the engine, both stores and the fakes were all found in
   one pass.
3. A signal that means "this bill is bad" must not be fed by a condition that is
   true of every bill. If a counter would fire identically for all of them, it is
   measuring something else.
4. Session state is **device-global and derived**, never stamped on a row. The
   token lives in memory, so a stored per-bill "session expired" flag outlives
   its own truth the moment someone signs in.
5. Clear the queue's backoff on sign-in. Every delay on it was computed while
   there was no session, which was never a fact about the network — without that,
   signing in appears to do nothing for up to 30 seconds.
6. Bills stay queued, intact, in weighing order, with the same idempotency keys.
   An expiry must cost the yard nothing but a tap.

---

**SOURCE:** `403-is-about-what-the-caller-may-do.md`

# A 403 is the fourth class: the caller is SOMEONE, and may not do this

Applies to every authenticated path, and to every screen assembled from more than
one renderer. Sibling of [[401-is-about-the-caller-not-the-bill]] — same question,
different answer, and the difference decides what the app does.

## The rule that produced it

[[401-is-about-the-caller-not-the-bill]] says: before choosing a failure class,
ask what the failure is ABOUT — the payload, the network, the server's state, or
the identity of the caller. A 403 is about the caller, like a 401. That is where
the resemblance stops, and the axis they differ on is the ACTION:

| | 401 | 403 |
|---|---|---|
| who is the caller | **nobody** — the token is dead | **someone**, definitely |
| what fixes it | one tap, on this device, now | a **different person**, elsewhere |
| does signing in help | yes — that IS the class | **no**: same user, same role |
| does it clear on sign-in | always | only if the identity really changed |

So `forbidden` is its own `SendOutcome`/`VoidOutcome` member, not a variant of
`session_expired`. Three reasons, in order of how expensive getting them wrong is:

1. **The session class is DEFINED by carrying its own action.** That lesson's
   second property is "the message must carry its own action", and the action is
   the sign-in button. For a 403 that button is a loop with a person in it: the
   same account comes back with the same role. Either the button lies, or the
   class stops always having one — and then it no longer means anything.
2. **It would evaporate every pass.** `App.syncOnce` clears `sessionEnded` on ANY
   server answer at all (`r.synced > 0 || r.rejected > 0 || r.masterDataBlocked > 0`),
   because for a session that is correct — an answered request proves the token
   works. Fold a role refusal in there and it is retracted by the next successful
   send and re-raised by the next tap, forever, flickering.
3. A new union member is a compile error in every `switch`, both stores, the fakes
   and the view. That is how the engine, the store, `billNotice`, the two style
   Records and 19 proof call sites were all found in one pass.

**The wording follows from the same distinction.** Never "sign in again" — that is
the 401's fix and here it is a loop. Never "call support" — support cannot grant a
role. It names the shop owner (`เจ้าของร้าน`), and specifically NOT the office
(`สำนักงาน`), which is who the parked-bill wording names: the office sets prices
and grades, a role is the owner's. A wrong instruction is worse than a vague one
because it gets acted on ([[correct-classification-can-still-render-as-an-error]]).

## The defect this actually shipped: one card, two renderers

The refusal reached the client correctly. `billNotice` was taught it, the tone was
right, the store stopped retrying, the strip said the true thing. And the card
still contradicted itself, because `voidProgressLine` — drawn TWO LINES ABOVE the
notice box, on the same card, by the same component — had not been taught it and
went on returning:

> รอแจ้งระบบ จะดำเนินการให้อัตโนมัติ   *(waiting to tell the system; it will be done automatically)*

directly above

> บัญชีนี้ไม่มีสิทธิ์ยกเลิกบิล ระบบจึงยังไม่ได้ยกเลิกบิลใบนี้
> *(this account may not cancel bills, so the system has not cancelled this one)*

Both renderers were internally correct and separately asserted. Every sweep in
`proveNotice` read ONE of them at a time — 384 card cells, 64 void cells, all
green — and not one of them could see the contradiction, because **the operator
does not read a function, they read a card.** The reassuring half is the one
someone with wet hands and a queue behind them will believe.

**The fix that matters is not the branch, it is N2b:** a sweep that concatenates
what the view actually draws, in draw order, and asserts over the whole string —
no region may promise what another region denies, no region may leak a
diagnostic. 384 whole-card states.

> **A screen assembled from independently-correct parts is not an asserted
> screen.** If two functions render into one view, the assertion belongs on the
> concatenation. Correctness of the parts is not a property of the whole, and the
> gap between them is invisible to every test that respects the seam.

This is the third time this family has bitten (raw 424 body, then the offline
card and the false void promise, now this), and each time the previous fix was
correct and covered one renderer fewer than the screen has.

The same rule forced two view changes that no unit assertion would have caught:
`isVoided` (the owner ASKED) is not `the system cancelled it`, so the card
computes `voided = isVoided(b) && !isVoidRefused(b)` — otherwise ยกเลิกแล้ว with
the total struck through, over a bill the server still holds as live money. And
`notice.badge` now outranks the void badge, which is what makes that structural
rather than remembered.

## The mechanism was NOT symmetric, and assuming it was is the error

The brief for this work said the 403 "retries forever, feeds the poison counter,
and ends at a red ติดต่อฝ่ายสนับสนุน". Half right, and the half that was wrong
would have sent the fix to the wrong place. Measured, not argued (`proveForbidden`
F5, which runs the OLD mapping):

- **VOID path.** `VoidOutcome` has no `reachable` field, `markVoidAttemptFailed`
  touches neither poison column, and `assessQueue` reads only the SEND queue. So
  the poison counter never moved and no alarm ever fired. What happened instead
  was quieter and worse: `listVoidsToApply` has no backoff column and no time
  gate, so the void was re-POSTed on **every pass — 20 calls in 20 passes, every
  4 seconds, forever** — behind a card promising it was in hand.
- **SEND path.** Here the brief was exactly right: `reachable: true` drove
  `server_error_attempts` to 8 and raised the red "ติดต่อฝ่ายสนับสนุน" alarm over
  a permission no support desk can grant. This path is not reachable on today's
  server (`POST /bills` is open to staff) and was fixed anyway, because the
  transport maps 403 on both endpoints and fixing the instance instead of the
  class is what produced the 2c-7 amendment.

**Two paths that look symmetric can fail differently, and the difference is
whichever safety machinery each one happens to be wired into.** The void path had
no backoff at all — the very absence that made "retry forever" literal there and
harmless-looking on the send path. Check what each path is actually connected to
before assuming a shared cause; and when a brief names a mechanism, reproduce the
mechanism, not the conclusion.

## What "never retries" had to mean in code

Not a longer backoff. A backoff is a claim that time will help, and no amount of
time on this device changes a role:

- **VOID** — `void_refused_at` on the row takes it out of `listVoidsToApply`. Per
  bill, and that reverses the 401 lesson's "device-global, never stamped on a
  row" ON PURPOSE: an expired session says nothing about any bill, but this row is
  claiming something false about ITSELF, and a claim on a row must be corrected on
  the row, durably, across a restart.
  This closed 403 and only 403 —
  `OPEN_ITEMS.md § Code debt found and left in place` records the same hazard
  still open for 404, 400 and 422.
- **SEND** — an in-memory `sendForbidden` flag on the engine gates the send loop.
  Device-global, not persisted: it is a claim about what the server said LAST, and
  a stored one would be a guess about next. A relaunch costs exactly one refused
  request, which is also the only way the app can ever learn the role was fixed.
- **Retraction** — a sign-in is the one event on this device that can change who
  is asking, so it is the only thing that lifts either. Same user signing back in
  costs one refused request, not a loop. **Known limit:** a role changed in the
  back office mid-session is invisible until the next sign-in; the token's TTL is
  one hour, so a shift re-asks at least hourly, and nothing else on the device is
  evidence about a role.

The client-side role gate (hide ยกเลิกบิลนี้ from staff, read from the token's own
`role` claim) **fails OPEN** on an unreadable token, which is the opposite of
[[config-defaults-must-fail-closed]] and belongs on the other side of the wire:
that lesson is about a SERVER accepting an identity it never verified. Here the
server re-reads the role from the users row on every request regardless, so the
gate prevents nothing — hiding the button from an admin whose token we merely
failed to parse would remove the only way to correct a wrong bill, while offering
it to a staff user costs one refused request and one plain sentence.

## Observed, on a real iPhone with a staff account

The device pass is what makes the rest of this more than a claim. One tap, then a
full minute untouched:

```
INFO:  192.168.1.243:54315 - "POST /bills/735ed2aa-.../void HTTP/1.1" 403 Forbidden
```

**One line. The last line in the log** — nothing else arrived for the rest of the
minute. Postgres, on that bill: `voided_at NULL`, `voided_by NULL`, `void_reason
NULL` (read as hex, per the codepage-874 footgun), `total_amount 220.00`, still
active as `B-2569-222`. The screen: red card, badge ไม่มีสิทธิ์ยกเลิกบิล, total NOT
struck through, no ยกเลิกแล้ว, no ติดต่อฝ่ายสนับสนุน, no sign-in prompt. Signing
back in as admin retracted the refusal and applied the ORIGINAL void with the
reason the owner had typed.

Note the asymmetry that is the design working: the server has no `void_reason`
because `require_admin` runs as a dependency and refuses before `void_bill` reads
the row. The reason lives on the PHONE, kept deliberately — the office needs to
know a cancellation was attempted on a bill the system still shows as live.

---

**SOURCE:** `a-backup-is-a-claim-until-it-is-restored.md`

# A backup is a claim until it has been restored

Applies to every dump, restore and verification path — and to anything else
whose success is reported by an exit code rather than by inspecting what was
produced.

`backup_db.py` exiting 0 says a process ran. It does not say rows are in the
file, that the file will land where you point it, or that what comes back is
still tenant-isolated. Each of those failed differently while this was built,
and every one of them fails GREEN.

## 1. The tenant model is also the way a backup captures nothing

Every business table is `ENABLE` + `FORCE ROW LEVEL SECURITY` and the policy
reads `app.tenant_id`, which no backup ever sets. Unset means no rows — the
system fails closed, which is exactly right for the API and exactly fatal for a
dump. A dump taken by `recycle_owner` or `recycle_app` fails loudly:

    pg_dump: error: query failed: ERROR: query would be affected by
    row-level security policy for table "sellers"

The trap is the obvious fix. `--enable-row-security` makes that error go away
by letting the policy apply — so pg_dump succeeds, exits 0, and writes a
schema-shaped file with **zero rows in it**. Never add that flag. Dump as a
role that can see every tenant, and prove it: count the rows **in the dump
file** and fail if a table has rows in the database and none in the file.

A count taken from the database is not evidence about the file. Parse the
`COPY ... FROM stdin;` blocks. That number is the only one that survives if
both the source and the restore target are wrong.

## 2. `--create` writes the target database name INTO the body

`pg_dump --create` is the natural choice for "reconstruct from nothing" — it
emits `CREATE DATABASE recycle` and then `\connect recycle`. That `\connect` is
a psql meta-command inside the file, and it wins over `-d`. Feed such a file to
`psql -d recycle_restore_scratch` and psql switches to the LIVE database
partway through and restores into it. A verification step silently becomes an
overwrite of production.

Take the body WITHOUT `--create` so it is retargetable, generate the
database-level DDL (owner, encoding, locale, ACL) from the catalog separately,
and have the restore re-check that the body contains no `\connect` before it
runs. The checksum gate does not cover this: a dump taken the wrong way has a
perfectly valid checksum.

## 3. An exit code that is guaranteed to be non-zero is not a verdict

`pg_dumpall --globals-only` always emits `CREATE ROLE postgres;`. On any
cluster you were able to connect to, that role exists — you are connected as
it. With `ON_ERROR_STOP=1` the roles step therefore aborts disaster recovery on
an error that means nothing. The following `ALTER ROLE` still applies the
attributes and the password.

So that one step must not be judged by its exit code. Judge the END STATE:
every role the backup recorded exists, with the recorded `rolsuper` and
`rolbypassrls`. That check is not bookkeeping — a `recycle_app` restored with
`BYPASSRLS` reads every tenant's rows while the policies sit there looking
correct, and nothing in the application would notice.

## 4. "Restored matches source" is vacuous unless the source has moved

Restore into a scratch database, compare against the source, all green — and a
restore that did absolutely nothing passes, because the verification queries
could be reading the live database and no one would know.

Make the two databases disagree on purpose. Mutate the source AFTER the dump,
then assert the restored copy shows the DUMP's moment and not the source's:

* a marker bill written after the dump is present in the source and **absent**
  from the restore;
* the `doc_no` counter reads one lower in the restore than in the source.

Those two invert or collapse the moment a check reads the wrong database, so
they are the first thing to look at when this proof goes green after a change.

Compare money and weight as TEXT, digit for digit — a float comparison can
agree while the digits differ. Compare Thai as UTF-8 hex, never by eye
(see [[console-is-not-the-observation]]).

## 5. What a restore cannot restore

The moment. `pg_dump` reads one repeatable-read snapshot at its start, so the
file is internally consistent and frozen there. With no WAL archiving there is
no point-in-time recovery, and everything written between two backups is gone
with the disk. Say the window out loud — "up to a day" — rather than letting
"we have backups" imply otherwise.

---

**SOURCE:** `a-check-that-never-went-red-was-never-observed.md`

# A check that has never gone red has not been observed

**Applies to** every assertion, guard, detector and proof cell — and especially
to the instrument you are about to cite as evidence for something else.

**The rule:** every negative assertion needs a POSITIVE CONTROL — a known-true
case, run in the same pass, that makes it fire. A check nobody has watched go red
is a claim about the code, not a measurement of it.

**SEVENTEEN MECHANISMS, and this line is the ONLY place in this file that says how
many.** Every heading below names its own mechanism and never the running total,
so appending another is a one-number edit, here.
**It read FIFTEEN until 2026-08-19, and the correction is its own instance.**
`a60340c` appended `## A SIXTEENTH MECHANISM` at the foot of this file and did not
touch this line — `git show a60340c -- <this file> | grep -E "FIFTEEN|SIXTEEN"`
returns exactly one line, the added heading. The one-number edit named in the
sentence above was not made, by an author who had just written the mechanism it
counts. That is the second instance behind
`lessons/a-quantified-sentence-names-no-member.md`, which is about the sentences a
membership change falsifies WITHOUT NAMING THE MEMBER: a count is one of them, and
it is the only kind this file can carry. This line exists because the
count used to live in three headings and in this file's index line, and all four
went stale together while the body grew from four to nine — the index line ended
up reading "Six mechanisms" and "a NINTH mechanism" in one sentence.

Sibling of [[a-checker-must-not-share-the-code-it-checks]] — that one is about
where the expected value comes FROM; this one is about whether the assertion
could have failed AT ALL. Of the first four cases below, three share no code
with what they check.

## The first four instances — four mechanisms, one symptom

**1. The needle was empty — in the instrument itself.** A verifier written to
confirm `lessons/all-lessons.md` carries no UTF-8 BOM contained:

```python
print(f"starts with UTF-8 BOM : {raw.startswith(b'.'.replace(b'.', b''))}")
```

`b'.'.replace(b'.', b'')` is `b''`, and `startswith(b'')` is **True for every
input that has ever existed**. It printed a confident `True` about a file that
in fact had no BOM — right answer, no measurement, in the one script whose whole
job was to be believed. The sibling line had the same defect: it counted an
escape sequence that the file-writing tool had already converted, so it searched
for text that could not occur.

The fix is the rule, and it is three lines:

```python
BOM_BYTES = bytes([0xEF, 0xBB, 0xBF])   # built numerically: no escape to mangle
assert len(BOM_BYTES) == 3, BOM_BYTES   # the check that the check is real
print(f"contains U+FEFF : {raw.count(BOM_BYTES)}")
print(f"  (control: same count in README.md, known to carry one: "
      f"{(LESSONS / 'README.md').read_bytes().count(BOM_BYTES)})")
```

The control prints **1** for `README.md` and **0** for the generated file. Only
the first number makes the second one mean anything. Without it, `0` is
indistinguishable from a detector that cannot detect.

**2. The needle was empty, in a language with no types to save you.** A
CR-counting check ran `grep -c $'\r'` inside a `for` loop. `$'\r'` reached grep
as an EMPTY pattern; an empty pattern matches every line; the count came back
equal to each file's line count and was read as a CR count. Every file "had CRs".
*(Observed at this terminal and not recorded anywhere in this repo — there is no
`.sh` file and `git log -S "grep -c"` finds nothing. It is written down here
because this is now the only place it exists.)*

**3. The failing case was never reachable, because the input was a literal.**
`mobile/src/proof/proveSignOut.ts:137-152` proves the send queue blocks a
sign-out:

```ts
const outcome = await signOut({
  pending: 3, failed: 0, setSyncPaused: (p) => { paused = p; },
  tokens, engine: null,
});
check("the sign-out is refused", outcome.kind === "refused_pending", outcome.kind);
```

`pending: 3` is a number handed in, and `engine: null` means there is nothing
present that could ever drain it. The cell is true and it proves the gate refuses
**a number** — never that the number is unclearable, which is the only state in
which the refusal is a trap rather than a wait. A green here is silent about the
case where waiting cannot work.

**And this file already knows the rule, twelve lines further down**, applied to
its neighbour and not to this cell:

> The count must come FROM the input. `includes("3")` passed on any sentence
> holding that digit; a sentence with the count baked into it would still
> satisfy the check above. A second, different count cannot be hardcoded.

— followed by a second call with `pending: 7` asserting `7 ใบ`. That is a textbook
positive control, written deliberately, three lines from a cell that has none.
**A control on one assertion says nothing about the one beside it.**

**4. The mutation never reached the assertion.** Eight expected values in
`proveSignOut.ts` were substituted in `CLEARED_SESSION`, one per run, to
wrong-but-plausible values, to find out which cells could fire. Every single one
was a COMPILE error — `TS2322` at `signOut.ts`, *"Type 'true' is not assignable
to type 'false'"*. The build stopped; the proof never ran; not one of the eight
cells was observed doing anything. The literal types are a real guarantee and a
valuable one — but they are a DIFFERENT guarantee, and the mutation test
returned no information about the runtime checks at all. **A disproof that is
intercepted upstream has not been performed.**

## What the first four have in common

| | why it could not go red |
|---|---|
| 1, 2 | the assertion is vacuously true — no input exists that fails it |
| 3 | the failing state is unreachable from the inputs the test supplies |
| 4 | the deliberate break was stopped before the assertion ran |

Different mechanisms, one consequence: **a green cell that carries no
information, sitting in a report read as though it did.** That is worse than a
missing test, because a missing test is visible in the count and this is not.

## How to apply

1. **Before citing any check as evidence, make it fail once on purpose.** Keep
   the red output. If you cannot make it fail, you have not found a bug in your
   mutation — you have found that the check is not a check.
2. **Every detector gets a positive control in the same run**, over a case known
   to be true. Print both numbers side by side. `0 violations` means nothing;
   `0 here, 1 in the known-bad case` means something.
3. **Build needles numerically, not from escapes** — `bytes([0xEF,0xBB,0xBF])`,
   `chr(0xFEFF)` — and assert their length. Every layer between you and the file
   (shell, editor, tool) is entitled to rewrite an escape, and a mangled needle
   fails silently toward green.
4. **When you mutate to test, verify the mutation REACHED the assertion.** A
   compile error, a build step, a validation layer or a type can all consume it
   first. The observable is the check running and printing red, not the run
   failing somehow.
5. **Never generalise a control across neighbours.** Instance 3 is the whole
   argument: the author who wrote the control knew the principle, and the cell
   above it still cannot fail.

This is the passing-result twin of
[[a-defaulted-getattr-is-a-silent-dead-branch]] — there, a production branch no
test was ever seen to ENTER; here, an assertion no run was ever seen to REDDEN.
Same question in both: *what would have made this different?* And it sits beside
[[proof-must-run-twice]] and [[concurrency-tests-need-a-barrier]], which are the
same family: **a passing result is evidence only if you know what would have made
it fail.**

## AMENDED (2026-08-07): a fifth mechanism — the instrument never read the artifact

The four above share one shape: a check that **could not fail given its inputs**.
This one is different, and it is worse, because the check is real, it can fail,
and it has been watched failing. **It was pointed at a different file.**

`tools/verify_citations.ps1` resolves every citation in a document and exits 1 if
any is broken. It works — it has a positive control, it has been observed going
red, and its own header records the false green it was hardened against. But its
subject was one hardcoded line:

```powershell
$src = Join-Path $root 'START_HERE.md'   # the only file it would ever open
```

`ARCHITECTURE.md` was then written, carrying **37 citations in exactly the form
this script exists to verify**, and the phase brief named "`verify_citations.ps1`
bare, exit 0" as the observable FOR THOSE CITATIONS. It exited 0. **It had not
opened the file.**

**Why this is the sharpest instance in the file: the green was structurally
incapable of ever turning red.** Mechanisms 1–4 each describe a check that some
input could still move. Here none can. Every citation in `ARCHITECTURE.md` could
be broken, the file could be deleted, and `CITATIONS=37 BROKEN=0` would print
unchanged, because the number was about a different document. **No control inside
the run can catch this**: the sections control asserts the parser saw every
sectioned citation *in the file it read*, and it was correct and green throughout.

**Measured, not reasoned.** The same rules ported to a second instrument and
pointed at `ARCHITECTURE.md` returned **BROKEN=8** at the same moment, on the same
tree, that the committed one returned **BROKEN=0**. Seven were real: six citations
line-wrapped by the writing — a handle split across two source lines is a string
that exists on no line of its target — and one whose TARGET's own prose wraps, so
no handle spanning it could ever resolve. All seven would have shipped under the
green.

*(The eighth was the second instrument's own defect, and it is mechanism 1 again:
it read `lessons/README.md` as plain UTF-8, leaving the BOM in front of the
`# Lessons` heading so the `^#` anchor missed and a VALID citation reported
BROKEN. A second instrument built to check the first needs its own controls.)*

**The disproof that finds this mechanism is one question, and it is not "does it
pass".** Everything in this file passes. It is: **break the artifact on purpose
and watch whether the number moves.** If deliberately breaking the thing you
believe is under test cannot change the output, the output was never about it.
Two minutes, and it is the only test that separates a checker which agrees with
you from a checker which is looking somewhere else.

### Two more, appended to How to apply

6. **An instrument's SCOPE is part of its result, and only its source list states
   it.** A checker's NAME says what it is for; the paths it OPENS say what it
   actually covers, and only the second is true. Read them before quoting an exit
   code — hardest when the artifact is NEW, because a checker written before your
   file existed cannot know about it and will not say so.
7. **Prefer a checker that takes its subject as an argument** over one that
   hardcodes it, and **assert a NON-ZERO count per subject**. A hardcoded source
   silently excludes every file added after it; an argument makes the omission
   something a person has to type. Without the non-zero assertion, "nothing was
   checked" and "nothing is wrong" print the same line.

**And the trap this sets for a reviewer, which is why it belongs here and not in
a note about tooling:** the brief ORDERED the green, the green was produced, and
**it was true**. That exit code really was 0 and really did mean `START_HERE.md`'s
citations resolve. Nothing was faked and nobody was careless; the report would
have been accurate in every word it contained. **A true statement about the wrong
object is the hardest false assurance to see**, because there is no error to
notice and the number is real.

Sibling of [[a-checker-must-not-share-the-code-it-checks]] one step further out:
that one asks where the expected value came FROM, this one asks what the INPUT
was. And it is [[two-green-proofs-do-not-cover-the-seam]] pointed at instruments
rather than components — there, no proof file owned the seam; here, no checker
owned the new file, and in both cases the thing nobody owns is the thing nobody
measures.

## AMENDED AGAIN (2026-08-07): a sixth mechanism — the instrument never read what POINTS AT the artifact

The fifth is *the instrument never read the artifact*. This is its **inverse, and
it is harder to see**: the instrument DID read the artifact, opened it, parsed
every citation in it, ran both controls over it and reported it clean — **and the
report was true.** What it never read was the file pointing AT it.

**The instance.** `ROADMAP.md` was REPLACED rather than amended. The old file
carried a heading `## What next, and why that`; the new one did not. `ARCHITECTURE.md`
line 11 carries a section-only citation, `` `ROADMAP.md § What next, and why that` ``,
naming the file's role in the document map. **Deleting a heading from the file you
are editing breaks a citation that lives in a file you are not**, and nothing in
the edited file records that anyone was depending on it.

**MEASURED, and the measurement is the whole amendment.** The break was found once
by accident and then reproduced deliberately, by re-deleting the same heading on
the same tree:

| run | exit | what it said |
|---|---|---|
| `-Source ROADMAP.md` | **0** | `CITATIONS=56 BROKEN=0`, **both controls OK** |
| `-Source START_HERE.md,ARCHITECTURE.md,ROADMAP.md` | **1** | the break prints under `=== SOURCE: ARCHITECTURE.md ===` — `22 BROKEN ROADMAP.md sect=What next, and why that hits=0 (section-only)` — while `ROADMAP.md` reports `BROKEN=0` **in the same run** |

Reverted; `sha256` `f23dea1b…f456e3` identical before and after; all three sources
then green, `SOURCES=3 CITATIONS=130 BROKEN=0`.

**The first row is the finding.** A person who has just rewritten a file and wants
to know whether they broke anything will scope the checker to that file — it is the
obvious thing to type, and the citations they are anxious about are their own
outbound ones. They would have been told `BROKEN=0`, with both positive controls
holding, about a repository they had just broken.

**Why it is not the fifth mechanism restated.** There, the damaged file was the
SUBJECT of the change and was simply absent from the source list. Here the changed
file is present, is read, and is genuinely clean. **The direction of the pointer is
what hides it**: a citation is WRITTEN in the citing file and LIVES OR DIES on a
heading in the cited one, so the damage propagates *opposite* to the edit. Every
tool that answers "is this file OK" is scoped the wrong way round for it, and the
answer it gives is not wrong — it is about the wrong file.

**This generalises past citations. A heading is an interface**, and so is a file
path, an anchor, an exported name, a handle. Any cross-file reference has this
shape, and it is why "I only touched one file" is never an argument about blast
radius.

### The tool makes this easy to get wrong, and this is the SECOND session to hit it

Said plainly rather than left as a lesson about care:

- **`verify_citations.ps1`'s default `-Source` is `@('START_HERE.md','ARCHITECTURE.md')`
  and is now STALE.** `ROADMAP.md` carries 56 citations and the default will never
  open it. Run with no arguments after editing `ROADMAP.md` and you check two files,
  neither of which is the one you changed, and exit 0. The header already says *"if
  you add a document that cites, ADD IT TO `$Source`"* — that is an edit to the
  script, and a phase constrained to one modified file cannot make it, so the full
  source list has to be typed by hand every time and nothing enforces that.
- **The default is wrong in both directions at once**, which is why it is worth a
  paragraph: it omits the newly written file (missing every OUTBOUND break) and it
  happens to include `ARCHITECTURE.md` (catching this INBOUND one) — the second by
  luck rather than design, because `ARCHITECTURE.md` was added to the default for an
  unrelated reason.
- **`powershell -File script.ps1 -Source A,B,C` does not work**: `-File` binds
  `A,B,C` as a single string, and the script reports `SOURCE MISSING: …A,B,C` and
  exits 1. Harmless because it is red, but it pushes the next person toward the
  bare default, which is the failure above. Invoke the script directly
  (`& .\tools\verify_citations.ps1 -Source A,B,C`) so `[string[]]` binds.

### Two more, appended to How to apply

8. **Run a citation checker over EVERY source, never over the file you are
   editing.** The file you edited is the one place an inbound break cannot appear,
   so scoping to it is the single most dangerous scope available — it is the same
   number the fifth mechanism produced, arrived at from the other side. If you can
   only afford one run, run the whole set; there is no cheaper subset that is safe.
9. **Before deleting or renaming a heading, grep for it across the repository.**
   One command, and it is the only thing that turns "a section I removed" into "a
   contract I broke". Replacing a document entirely is the maximum-risk form of
   this, because every heading it had is deleted at once and the diff shows only
   additions in the file you were looking at.

**The trap it sets is the fifth's trap wearing the opposite face.** There, the
brief ordered a green and got a true statement about the wrong object. Here, the
brief's green is a true statement about the RIGHT object — `ROADMAP.md`'s citations
really do all resolve — and it is still a false assurance, because the question
being asked was "did I break the repository" and the instrument answered "is this
file internally consistent". **Two different questions with the same exit code.**

---

## A SEVENTH MECHANISM (P1.4, 2026-08-07) — the guard is reachable, but a SIBLING GUARD gets there first

The second mechanism is "the failing state is unreachable from the inputs
supplied", and its remedy is to supply better inputs. **This one cannot be fixed
that way, because no input exists.** The state is unreachable through every path
the product has, and it is another correct guard that makes it so.

**The shape.** `POST /users/{id}/deactivate` locks an account and bumps
`token_version` in the SAME `UPDATE` — deliberately, so a lock has no window in
which the sessions it should have ended are still live. `get_principal` then holds
two independent guards:

    _require_active_account(row["is_active"])          # is this account usable
    _require_live_session(token_version, row["..."])   # is this token current

After a lock, **both are true of every token in existence**. Put the account check
second and it can never fire: the version check refuses first, every time, and no
request can be constructed that reaches the account check — because minting a
token for a locked account requires a login, and login refuses one. A guard in
that position is not weakly tested. It is **untestable**, and deleting it changes
nothing observable at all.

**MEASURED, not reasoned.** Ordered FIRST, the guard deleted (mutation B, against
a restored scratch database): `prove_revocation.py` exit 1, and **exactly two
cells fired — both the ones reading `code`.** Sitting immediately beside them,
GREEN:

    [FAIL] case7: the refusal names the ACCOUNT (account_inactive), not the token
    [FAIL] case7: the refused bill create names the account, not the token
    [OK  ] case7: the token held before the lock is refused
    [OK  ] case7: a locked account cannot reach the money path

The request is **still 401**. It falls through to the version check and comes back
`token_revoked` instead of `account_inactive`. **A proof asserting only the status
would have been fully green with the guard deleted** — 57 of 57, nothing to see.

**Two rules, and the second is the one that generalises.**

10. **When two guards can both be true of the same request, ORDER the one that
    names the durable fact first** — and know that you have thereby made the
    other one's green partly uninformative for that input. Ordering is not
    cosmetic here; it decides which guard is observable at all.
11. **Assert on the field that DISCRIMINATES, not the field they share.** Both
    guards answer 401; only `code` says which one answered. Ask of every
    assertion: *if I deleted the thing this is supposed to be watching, would
    this cell move?* Where two mechanisms produce an identical outcome, the
    shared outcome is not evidence about either.

**Why it is not redundancy.** The guard still earns its place — it is what
refuses if any future path mints a token for a locked account (a bump made
conditional, a password reset, an onboarding tool). But its value is
FORWARD-LOOKING, and a forward-looking guard is exactly the kind whose green
nobody checks. Say so at the site, in the code, or the next reader will delete it
as dead and every test will agree with them.

**The family.** The fifth and sixth mechanisms are about an instrument reading
the wrong artifact. This one is about an instrument reading the right artifact
through the wrong FIELD — the observation was available, one key away, and the
obvious assertion could not see it.

---

## AN EIGHTH MECHANISM (P1.10, 2026-08-07) — the stimulus stopped arriving, and NOBODY EDITED ANYTHING

The second mechanism is *"the failing state is unreachable from the inputs
supplied"*, and every instance of it above is about the inputs' VALUES: a literal
`pending: 3`, an empty needle, a mutation the compiler ate. **This is the same
sentence with TIMING substituted for values** — and it has one property none of
the other seven has. **It arrived with no edit at all.** Nobody touched the proof.
The proof stopped proving.

**The shape.** `prove_reconcile.py`'s X3 probe asserts that a row landing WHILE
the checker sweeps is reported rather than absorbed. To land the row inside that
window it watches the checker's own stdout for a marker and inserts the moment it
sees one:

```python
if not injected and b"=== structure" in line:
    await conn.execute("INSERT INTO tenants (id, name) VALUES ($1, 'x3 probe')", tid)
```

Python **block-buffers a non-tty stdout at 8192 bytes**. Measured 2026-08-07: the
checker's entire report over the 2-tenant database is **5364 bytes**, with the
marker at byte **253**. Nothing reaches the pipe until the child exits. The marker
therefore arrives after the sweep is over, the row lands outside the window, X3
correctly reports no drift — and the probe has stopped probing **while still
printing `inserted tenant … mid-run`**.

**It was green on 2026-08-02, honestly, and red on 2026-08-03.** The green was
real: the row genuinely did land mid-sweep, and the report said
`rows_at_start=46 rows_at_end=47`. What changed on 2026-08-03 was that the
database was rebuilt from 46 tenants to 2. *(That the 46-tenant report ran to
several buffers is inference from the measured 5364 — each tenant prints its own
scope block — and it cannot be re-measured, because that database was replaced.)*
**No assertion changed, no code changed, no test was edited.** The fixture shrank,
and the stimulus the assertion depended on stopped being delivered.

**Why it hid, and this part is not incidental.** It failed inside a proof that was
ALREADY RED for three unrelated reasons — three hardcoded counts of the destroyed
database — and it wore the same label they did. Four failing cells, three of one
kind and one of another, recorded in two documents for four days as *"the two
tenant-count assertions and the X3 timing probe"*. Nothing in the output separates
"this expectation is stale" from "this probe never fired": both are a red cell
under one heading. **A failure that resembles the failures beside it does not get
investigated separately** — and the repair everyone had written down (derive the
three counts) would have left this one red, because it had no count to derive.

**MEASURED, with the prediction written first.** The mechanism was named before it
was tested, and the test required editing nothing at all:

| run | change | result |
|---|---|---|
| baseline | none | 4 failing cells, X3 reporting `got {}` |
| disproof | `PYTHONUNBUFFERED=1` on the parent, inherited by the child | **3 failing cells** — `X3: a row landing mid-run is reported` GREEN, the other three unmoved |

One cell moved, exactly the predicted one; three stayed red. The fix is `-u` on the
child's **argv** rather than in the environment, because an argument cannot be
dropped by whoever launches the script, and it changes WHEN bytes arrive and
nothing about what the checker computes. On the repaired file, removing `-u` again
reproduces `got {}` while every neighbouring cell stays green.

### Two more, appended to How to apply

12. **A test that synchronises by OBSERVING the thing under test has an unwritten
    dependency on how much output that thing produces.** Watching for a marker in
    a child's stdout, waiting on a log line, polling until a file appears — each
    ties the assertion's reachability to a volume nobody declared and no fixture
    guarantees. Ask of any such probe: *what does the fixture have to be for this
    to still land?* Write the answer beside it. It is part of the test's contract
    and it exists in no other place.
13. **Prefer a synchronisation point the test CONTROLS over one it merely
    watches.** Where you cannot have one — the marker here is genuinely the
    earliest SAFE point, since anything sooner risks the row landing before the
    window opens, which would be a silent false negative — make the residual fail
    CLOSED and say so at the site: if the row lands late, X3 does not fire and the
    cell is RED. Never green.

**The question this adds, which the other seven do not ask.** Instances 1–4 ask
*could this assertion have failed given the inputs I supplied?* and 5–7 ask *was it
looking at the right thing?*. This one asks: **does this assertion still reach its
failing state on TODAY's fixture?** That is not a property of the test. It is a
property of the test and the data TOGETHER — so it can lapse with no diff, and no
review of the change that broke it will ever show it, because there was no change
to review.

**A fixture is an input.** Everything in this file about inputs applies to it, and
a fixture is the one input nobody re-reads when it changes size. Sibling of
[[proof-must-run-twice]], which is about a fixture a proof normalises for itself;
this is about a fixture the whole team replaced on purpose, correctly, with a
consequence nobody could see from the commit.

---

## A NINTH MECHANISM (2026-08-07) — the needle was fine and the HAYSTACK was empty

Mechanisms 1 and 2 are *the needle was empty* — a defect in how the instrument
built its own search term, fixable by building the needle better. **This is the
same vacuity arriving from the opposite end, and no care taken over the assertion
can prevent it**: the needle is correct, the comparison is correct, and the
COLLECTION being searched came back empty from the system under test.

**The shape.** A cell asserting that something is ABSENT from a collection parsed
out of a response:

```python
b_ids = {u.get("user_id") for u in body_of(r_b_roster).get("users", [])}
check(listed_staff_id is not None and listed_staff_id not in b_ids,
      "tenant A's staff is ABSENT from tenant B's roster")
```

`x not in set()` is true for every `x` that has ever existed. So is `x not in
{something wrong}`. **Absence and correctness are indistinguishable whenever the
response is empty — and also whenever it is uniformly wrong.**

### Two instances, measured on the same day, and the second is the one that decides it

**Instance 1 — the collection was empty because the response was an ERROR.**
`prove_revocation.py` CASE 5 has tenant B's admin revoke ITSELF, deliberately, to
prove self-revocation ends the caller's own session; CASE 6 then mints a fresh
token. A new CASE 6b used the OLD token. `GET /users` answered **401**,
`.get("users", [])` turned that into `[]`, and the isolation cell printed `[OK]`
over a response containing no roster at all.

**Instance 2 — the collection was full, and every value in it was wrong.** A
mutation resolved the roster's `user_id` from `tenant_id`, so tenant A's ids all
came back `1111…` and tenant B's all came back `2222…`. The same cell passed
again — this time because **two WRONG values happened to differ.** The property
it names, tenant isolation, had nothing to do with it.

| | status cell | the ABSENCE cell | the positive control |
|---|---|---|---|
| instance 1 — 401, empty list | **RED** | green, vacuously | **RED** |
| instance 2 — 200, every id wrong | green | green, **by accident** | **RED** |

**Instance 2 is why this is a mechanism and not a note about token hygiene.** In
instance 1 the status assertion also fired, so the run was going red anyway — but
it fires under the wrong NAME, saying "B's admin did not get a 200" rather than
"your isolation cell measured nothing". In instance 2 the status cell is green,
the absence cell is green, and **the positive control is the only red in the
file.** Nothing else available could have substituted for it.

### Why it is not one of the eight, and why it is not the differential lesson

Not mechanisms 1–2: the needle is well built and the assertion is capable of
failing. What is empty is supplied by the system under test, through an error
path, at runtime.

Not mechanism 3: the failing state is perfectly reachable — a genuine isolation
break puts A's id in B's roster and the cell fires correctly. It is reachable and
it was not reached, because a *different* failure got there first and satisfied
the assertion on the way past.

**And deliberately NOT filed under
[[a-differential-control-is-only-as-good-as-its-weaker-side]], which is the near
miss and the reason this section says so out loud.** That lesson is about a
comparison one of whose operands *the proof supplies itself*, and its remedy is to
derive both sides from the real path. **Here the proof supplied neither.** Both
operands were read off live responses; that discipline was followed exactly, and
it did not help. What that file asks — *could this assertion have come out the
other way, given the inputs I supplied?* — is necessary and **not sufficient**:
in instance 2 it could have, and it came out the right way for the wrong reason.
The question this adds is the follow-on: **if it came out right, was it right for
the reason it names?**

### Two more, appended to How to apply

14. **An assertion that something is ABSENT needs a sibling asserting something
    is PRESENT — in the SAME RESPONSE, not merely in the same run.** The failure
    mode is that response being empty, refused or uniformly wrong, and a control
    read from any other response cannot see it. One extra line: assert that the
    collection contains the thing it *should* contain, then that it lacks the
    thing it should lack. Neither half is worth much alone.
15. **Before asserting over a collection parsed from a response, assert the
    response.** `body_of(r).get("users", [])` flattens 401, 403, 404, 500 and an
    unparseable body into the same empty list, and every "is not in" over an empty
    list is true. A defaulted empty collection is
    [[a-defaulted-getattr-is-a-silent-dead-branch]] one layer out — an absent
    value read as a confident answer — and it fails toward green.

**The family.** Mechanisms 1–4 ask *could this have failed given my inputs?*, 5–7
*was it looking at the right thing?*, 8 *does it still reach its failing state on
today's fixture?*. This one asks the question that survives a yes to all four:
**how many DIFFERENT states satisfy this assertion, and is "the code is correct"
the only interesting one?** Every negative assertion — absent, not equal, not
present, zero, empty — has a large satisfying family, and the members of it that
are silent breakage are exactly the ones a proof will never think to supply.

---

## A TENTH MECHANISM (P1.8a, 2026-08-17) — BOTH SIDES OF A CROSS-CHECK CAME FROM THE SAME FAILED OPERATION, AND AGREED

The ninth is *the needle was fine and the haystack was empty*, and it is about a
NEGATIVE assertion over a collection. **This is a POSITIVE assertion between two
scalars, and it is the strongest cell in the file.** It compares a value read off
the response against the same value read back out of Postgres — the cross-check a
phase brief explicitly ordered, in these words:

> Read back OUT OF POSTGRES, not off the response — a response echoing your own
> input proves nothing about what was stored.

That instruction is correct. It was followed. **And the resulting cell is
satisfied by the request never having been served.**

**The shape.**

```python
r1 = client.post(f"{BASE}/sellers", headers=auth(token_staff), json=body1)
b1 = body_of(r1) if r1.status_code == 201 else {}
assigned = b1.get("code")
check(stored_code(b1.get("id")) == assigned,
      "cell1: and Postgres stores that same code for the new row")
```

Under the disproof — `POST /sellers` put back behind `require_admin` — the create
is refused 403. `assigned` is `None`, because there is no body. `stored_code(None)`
is `None`, because there is no id to look up. **`None == None` printed `[ok]`,
directly beneath three cells that had just gone RED**, in the one run whose entire
job was to find out which cells can move.

| cell 1's four checks, under the reverted gate | |
|---|---|
| status is 201 | **RED** — got 403 |
| the response carries a code of the shape S\<n\> | **RED** — `None` |
| the assigned number is the one after the highest that existed | **RED** — `None` |
| **and Postgres stores that same code for the new row** | **green** |

Three of four moved, so the run went red and the disproof looked successful. **The
fourth is the one that mattered**, because it is the only cell in that group that
reads the database at all, and it is the cell a reviewer would point at when asking
whether the write really happened.

### Why it is none of the nine

**Not the ninth.** Neither operand is a collection, neither assertion is negative,
and nothing was defaulted to `[]`. Two scalars are compared and they are equal.

**Not [[a-differential-control-is-only-as-good-as-its-weaker-side]]**, and this is
the near miss worth stating out loud. That lesson is about one operand being a
LITERAL — the relation true by construction. Here NEITHER side is a literal: both
were derived from the real path, which is exactly the remedy that file prescribes,
and it did not help. **What makes them agree is that they are derived from the SAME
EVENT.** When the event does not happen, both derivations return the same null, and
a comparison between two nulls is the most convincing green available.

**The generalisation, and it is uncomfortable in the same way the fifth mechanism
is: the BETTER the cross-check, the more exposed it is to this.** A weak cell
asserts the response against a value the script typed, and a wrong response cannot
match it. A strong cell asserts two INDEPENDENT observations of one write against
each other — and independence is precisely what makes them share a failure mode:
both observers are observing the same absence, and absence is self-consistent.

### And the disproof did not finish, which is the second half

The same run died at cell 5 on `uuid.UUID(None)` — `seller2_id` was `None` for the
same reason. **Cells 6 and 7 never ran, and no `PROVE_SELLER_CREATE_EXIT` line was
printed at all**, which is the absence `CLAUDE.md § Machine footguns` already names
as the signal for a failed restore.

The fourth mechanism is *the deliberate break was stopped BEFORE the assertion ran*
— a compile error, upstream. **This is that sentence pointed downstream.** The
break reached the assertions, three of them fired correctly, and then the
instrument died on the null the mutation had produced. A crash and a red suite are
different results and only one of them is a measurement: a disproof exists to say
WHICH cells move, and this one had nothing to say about the two behind the crash.

Both halves have one cause. **A proof is written along its GREEN path**, where
every id is a string, every body parses and every response is 201 — and the
disproof is the first time any of that is false. Everything the script does with a
response is therefore untested at exactly the moment it matters most.

### Two more, appended to How to apply

16. **A cross-check between two readings of one write must assert, IN THE SAME
    CELL, that the write happened.** `a == b` where both are derived from one
    operation is satisfied when the operation did not occur. The fix is one
    conjunct on the same line — `assigned is not None and stored_code(id) ==
    assigned` — never a separate cell above it, because *a control on one
    assertion says nothing about the one beside it* is this file's oldest rule and
    a status cell three lines up did not stop this. Print both operands in the
    label: `db=None response=None` is unmistakable and `[ok]` is not.
17. **A disproof must reach the last cell, and getting there is a property of the
    proof you have to build on purpose.** Every id, uuid, parse and index on the
    failure path is a crash waiting for the run that matters. Make each one return
    a value that can be absent, make the absence a RED cell rather than an
    exception, and give any cell whose target came from an earlier cell a fixture
    that exists independently — here a sentinel row written before the server
    started, so cells 4–7 kept measuring the gate while 1–3 were refused. Then
    judge the disproof by whether it printed its exit line, not by whether it
    failed.

**The question this adds.** Mechanisms 1–4 ask *could this have failed given my
inputs?*, 5–7 *was it looking at the right thing?*, 8 *does it still reach its
failing state on today's fixture?*, 9 *how many different states satisfy this?*.
This one asks: **when the thing under test does nothing at all, what does each
side of my comparison become — and do those two nothings look the same?**

---

## AN ELEVENTH MECHANISM (P1.8a, 2026-08-17) — THE CHECK WENT RED, AND RED IS NOT ONE STATE

Every mechanism above is a GREEN that carries no information. **This one is a RED
that carries the WRONG information**, and it belongs in this file rather than in
a note about tooling because it is the same defect on the other side of the exit
code. This file's rule is *a passing result is evidence only if you know what
would have made it fail*. Its corollary, which nothing above states, is that **a
failing result is actionable only if you know WHICH of several conditions
produced it.**

**The shape.** `tools/verify_citations.ps1` reads a citation as a backticked
`file § section` followed by a quoted handle, and requires that handle to occur
in the target **exactly once**. It prints the same word for `hits=0` and for
`hits=2`:

```
19  BROKEN  lessons/README.md  sect=Lessons
    handle="a-checker-must-not-share-the-code-it-checks.md"  hits=2 L19,L42
```

**Those two conditions have OPPOSITE REPAIRS.** `hits=0` means the target is
missing — go and write it, or correct the path. `hits=2` means the target is
AMBIGUOUS — the thing pointed at exists twice, and it is the CITING file that
must change. A reader scanning that column for `BROKEN`, which is what the eye
reads, goes looking for a file that is not missing. `hits=N` is the only thing
separating them, and it sits at the end of the line after the handle.

This is the SEVENTH mechanism's rule turned on an instrument's OUTPUT instead of
on a proof cell: *where two mechanisms produce an identical outcome, the shared
outcome is not evidence about either*. There, two guards both answered 401 and
the discriminating field was `code`. Here, two conditions both answer `BROKEN`
and the discriminating field is `hits`.

### Why the handle was ambiguous BY CONSTRUCTION, not by carelessness

The handle was a lesson's FILENAME. In `lessons/README.md` a lesson's filename
appears **twice by design**: once at the head of its own index line, and again
inside another lesson's index line wherever that lesson cross-references it.
`a-checker-must-not-share-the-code-it-checks.md` is at L19, its own entry, and at
L42 inside `a-differential-control-is-only-as-good-as-its-weaker-side.md`'s.
**A filename handle is therefore ambiguous the moment any other lesson mentions
the file — and mentioning each other is what these index lines are FOR.**

**MEASURED 2026-08-17, and the measurement is what turns this from a typo into a
class.** Tool: ripgrep over `*.md`, pattern
`` `lessons/README\.md § Lessons`\s+"[^"]+\.md" `` — a backticked citation into
that file followed by a quoted handle ending `.md`:

| | count |
|---|---|
| citation sites using a FILENAME as the handle | **27**, across 6 files |
| distinct lesson filenames used that way | **16** |
| of those 16, resolving at exactly 1 today | **16 — none is broken now** |

**CONTROL, in the same run, because a count with no control is a count nobody
watched fire:** the handle repaired here comes back at **2** occurrences,
matching the checker's own `hits=2`, which is what says the script is reading
what the checker read; and the replacement handle comes back at **1**. Without
the first number the sixteen zeros mean nothing.

**The broader pattern — a backtick, whitespace, any quoted `.md` — returns the
same 27 across the same 6 files, so every filename-handle citation in this tree
targets `lessons/README.md`.** A second pattern allowing ANY handle into that
file returns **31**, so 27 of 31 citations into the lesson index name a filename.
The two patterns disagreeing by exactly the four non-filename handles is the
evidence that the narrow one discriminates rather than matching everything.

### TWO FAILURE PATHS, and only one of them has been observed

**BORN BROKEN — this is the one that was measured.** A citation is WRITTEN naming
a filename that ALREADY occurs more than once. It is red on its first run, which
is the safe direction; the cost is only that the word sent the author looking for
a missing target. That is what happened at `55b58e9`: the citation was never
valid, not made invalid.

**BECOMES BROKEN LATER — inferred from the mechanism, and never yet seen.** A
citation names a filename occurring once, and a future lesson cross-references
that filename in its index line. The citation breaks **with neither endpoint
edited**: not the citing file, not the cited section, not the handle. Twenty-seven
sites and sixteen distinct handles sit one cross-reference away from it. **Nobody
has observed this happen, and it is written here as a prediction rather than as a
finding**, which is the distinction the ninth mechanism's two instances turn on.

**Why it is not the SIXTH mechanism restated.** That one is damage propagating
*opposite* to the edit — you DELETE a heading in the file you are editing and
break a citation in a file you are not. Its remedy, rule 9 above, is *before
deleting or renaming a heading, grep for it*. This propagates the same way and
**arrives from an ADDITION, in a THIRD file that is neither endpoint**. Rule 9 is
silent about additions, and there is nothing to grep for at the moment of the
edit: the person adding a cross-reference is writing prose about lessons, not
touching anything anybody cites.

**And it shares the EIGHTH mechanism's worst property** — it can arrive with no
diff to review — while differing in what moves. There a fixture SHRANK and a
stimulus stopped being delivered; here a namespace GROWS and a handle stops being
unique. Both are properties of the check and the data together, and neither is
visible in the commit that causes it.

### The repair, so it is reproducible

**Use a distinctive phrase from the target's own index line, never its filename**,
and confirm it occurs exactly once BEFORE writing it. The repair here was
`"DUPLICATE ARITHMETIC"`, measured at 1 occurrence before the citation was
written. A phrase from the index line's own prose cannot be duplicated by another
lesson mentioning the file, because what other lessons write is the FILENAME.

**The residual, stated: one of the twenty-seven is in a file no run opens.**
`server/README.md` carries one such citation and appears in no `-Source` list used
in this repository, so its state is not measured by any check that runs here —
the FIFTH mechanism, still live, in the same instrument this amendment is about.

### Two more, appended to How to apply

18. **When an instrument reports one word for two conditions, read the
    discriminating field before acting on the word.** `BROKEN` covers missing and
    ambiguous; `0 violations` covers clean and never-looked; a non-zero exit
    covers the check failing and the harness failing. Ask of any red: *how many
    different states print this, and which one am I looking at?* — the same
    question the ninth mechanism asks of greens, and it is owed to reds too.
    **AND `BROKEN` COVERS A THIRD STATE, MEASURED 2026-08-17: a SOURCE that
    yielded no citations at all.** `verify_citations.ps1` adds 1 to `BROKEN` when
    its own non-empty control fires —
    `CONTROL FAILED (non-empty): RED_TEAM.md yielded ZERO citations. It was named
    as a source and nothing in it was checked.` — which is this file's whole
    subject working correctly, and it is invisible in the total. `BROKEN=7` was
    reported repeatedly across one day, in replies and in two permanent commit
    bodies, as "seven broken citations, all pre-existing". Six were handles that
    did not resolve. **The seventh was a file that had never been measured at
    all**, and the repair is not a citation fix — it is to write a citation or
    stop naming the file as a source. Found only because the total moved by one
    for a change that added no citation to any file the total was about.
19. **A handle is only as stable as the NAMESPACE it is unique in.** Choose one
    that cannot be duplicated by the ordinary growth of the target: prose from the
    line you mean, never an identifier that the target's own conventions repeat.
    And confirm the count is 1 at the moment you write it — a handle verified once
    is a handle that was unique once, and this file's whole subject is the
    difference between those two sentences.

**The question this adds.** Mechanisms 1–4 ask *could this have failed given my
inputs?*, 5–7 *was it looking at the right thing?*, 8 *does it still reach its
failing state on today's fixture?*, 9 *how many different states satisfy this?*,
10 *when the thing under test does nothing, do both sides of my comparison become
the same nothing?*. This one asks the mirror of the ninth, and it is the only one
in the file addressed to a RED: **how many different states produce this
FAILURE, and does the word in front of me name the one I have?**

---

## A TWELFTH MECHANISM (2026-08-17) — THE CELL WAS SOUND AND THE PREDICTION ABOUT IT WAS WRONG

Every mechanism above is a DEFECTIVE CELL: vacuous, unreachable, intercepted,
pointed at the wrong artifact, starved of its stimulus, or ambiguous in its red.
**This one is a sound cell, correctly written, capable of firing — and an author
who predicted it would move under a particular break, ran the break, and did not
notice it had stayed green.** The mutation was applied, it reached the cell, the
cell ran and printed. It could not move, because **the property it compares is
COARSER than the property the mutation damaged.**

**The shape.** `proveSheets.ts` cell S1 compares two independent walks of one
transition table: the module's own `reachableSheetStacks()`, and the proof
script's `walk()`, which is the same breadth-first search with the break wrappers
inside it. Agreement is a real cell — two implementations of one traversal, and
if they disagree one of them is wrong.

Two of the five breaks damage the reducer:

    --break=always_push   `open` pushes unconditionally, making the duplicate
                          the real `open` refuses to make
    --break=pop_all       `close` empties the stack instead of popping one

The cell was written asserting **the two walks must DISAGREE under either**, on
the reasoning that a damaged reducer must move differently.

**MEASURED. It went red under BOTH, saying `module walked 8, this script 8`.**
The reachable SET is unchanged by either damage, because each transition's
declared `from` keeps the damaged move off the frontier where it would show:

| break | what it damages | why the SET does not move |
|---|---|---|
| `always_push` | `open` stacks a second copy | `open_add_seller` is reachable only `from: ["seller_picker"]`, and pushing `add_seller` onto `[seller_picker]` is where the real `open` puts it anyway |
| `pop_all` | `close` empties instead of popping | `close_top` from `[seller_picker>add_seller]` lands on `-` instead of `[seller_picker]` — and `[seller_picker]` is still reached from `-` by `open_seller_picker` |

**A set is not a transition table.** Eight stacks is a quotient of the table; both
damages live in which transition leads where, which the quotient cannot express.

**And the damage WAS caught, four cells away, which is the whole reason this is
about prediction and not about coverage.** Under `pop_all`: S4
`seller_picker>add_seller -> -` where `seller_picker` was expected, S5
`--close--> -` must land back on `seller_picker`, and S6's count cell reporting
`3 moves` where four are required. Under `always_push`: S7 `72 pairs checked,
7 bad` and S8 `got seller_picker>add_seller>add_seller`. Three red cells per
break, in both cases.

### THE TRAP, and it is a counting habit rather than a reasoning error

**Three cells went red, so the disproof looked successful.** A run that goes red
under a deliberate break is exactly what this file asks for, and both runs did.
Had the reds been counted rather than READ, the conclusion would have been "the
break reddens the proof, S1 is validated" — about a cell that was never asserted
correctly and had just contradicted its author twice.

That is the same false assurance as the FIFTH mechanism's, arriving from the
other side. There a true green was about the wrong object; here a true red is
about the wrong CELL. In both, nothing is faked, the number is real, and the
reader's question is not the one the number answers.

### Why it is none of the eleven

**Not 1–2.** Both operands are genuinely computed lists of eight strings.
Nothing is vacuously true, and the same cell reddens correctly whenever the two
walks really do differ.

**Not 3, and this is the closest.** That one's failing state is unreachable *from
the inputs supplied*, and its remedy is better inputs — a literal `pending: 3`
becomes a derived value. Here the failing state is perfectly reachable: a
transition with a wider `from`, or a damage that pushes a kind not otherwise
reachable, moves this cell. **No input was withheld. The mutation was aimed at a
level of description the assertion does not resolve.**

**Not 4.** The break was not intercepted. It reached the cell, and the cell
printed its verdict.

**Not 5–7.** The right artifact was read — the module's own walk, the thing S1
exists to compare — and through the right field. No sibling guard answered first;
nothing is competing with this cell.

**Not 8.** The fixture is the transition table, and it was current. Nothing
lapsed with no diff; the table was written in the same commit.

**Not 9.** Neither collection was empty. Eight against eight.

**Not 10.** The two sides are two DIFFERENT traversals of one table, not two
readings of one event. They agree because the property is coarse — not because
an operation failed to happen and both derivations returned the same null.

**Not 11.** That one is about a RED whose word covers two conditions. This is a
GREEN under a deliberate break, which is this file's original subject.

### The half that makes it evidence

**The prediction was wrong, not the code.** The reducer break was real, the
reachable set genuinely does not move, and the app is not defective in any way
this uncovered.

What was done, and it matters more than the finding: the expectation was
corrected rather than the cell deleted. S1 now asserts agreement only when the
reducer is undamaged, and under those two breaks it **prints `[skip]` with the
reason in the run output** — a reader of that run is told, in the run, that this
cell is not being asserted and where the damage does show. Deleting the cell
would have removed a working check to hide a wrong guess; leaving the wrong
assertion in place would have left a cell that reddens for a false reason, which
is worse than either.

**A control that corrects its author is the strongest form this file has.** Every
instance above was found because a green was doubted. This one was found because
a RED said something the author had not predicted, and the author read it instead
of counting it.

### Two more, appended to How to apply

20. **Name the cell you expect to move BEFORE running the break, and check that
    cell specifically afterwards.** Rule 1 says make it fail once on purpose;
    that is necessary and not sufficient, because *something* failing is not
    *the thing you were validating* failing. A break with three reds and one
    unexpected green is a finding, and the green is the finding.
21. **Match the granularity of the assertion to the granularity of the damage.**
    Ask what LEVEL OF DESCRIPTION each speaks at: a SET cannot see a damaged
    transition, a COUNT cannot see a reordering, a STATUS cannot see which guard
    answered (the seventh mechanism, one level down), a TOTAL cannot see a
    misallocation. When a cell stays green under a deliberate break, that is
    information about THE CELL and not about the code — resolve it before
    reporting either.

**The question this adds.** Mechanisms 1–4 ask *could this have failed given my
inputs?*, 5–7 *was it looking at the right thing?*, 8 *does it still reach its
failing state on today's fixture?*, 9 *how many different states satisfy this?*,
10 *do both sides become the same nothing?*, 11 *how many states produce this
failure?*. This one asks the question that outranks all of them, because it is
about the pass that validates the others: **which cell did I predict would move,
did THAT cell move, and if it did not, is my model of the cell wrong or my model
of the damage?**

## A THIRTEENTH AND A FOURTEENTH MECHANISM (P-GUARD, 2026-08-17) — ONE AMENDMENT, BECAUSE THE PAIR IS THE FINDING

**Both were produced by ONE `Prove:` document, on ONE day, under ONE review.
Neither was found by running anything.** The thirteenth surfaced because two
measurements of the same command disagreed and somebody refused to pick one; the
fourteenth was found by a person reading the brief before it was dispatched, in
a check that had already been written, reviewed and approved. **Nothing was
executing yet. There was no red to notice and no green to doubt.**

That is why they are appended together. Every mechanism above is a defect in an
instrument pointed at CODE. These two are defects in the document that says the
code was proven — and a document is not run, so the entire disproof discipline
this file teaches never gets a chance to fire on it. **Split into two amendments
months apart, each reads as one more instrument bug and that datum is gone.**

### MECHANISM 13 — THE INSTRUMENT ANSWERS A DIFFERENT QUESTION DEPENDING ON THE INDEX

`git check-ignore` **consults the index by default**, so a TRACKED path is
reported as not-ignored no matter what the patterns say. Measured on
**git 2.50.1.windows.1**, in a throwaway repository, under a deliberately BROKEN
pattern (`.claude/skills/` in the directory form, which makes every negation
under it inert), against a path that is in the index:

```
git check-ignore -q            .claude/skills/async-python-engineering/SKILL.md
  -> exit 1   "not ignored"   READS AS PASS
git check-ignore -q --no-index .claude/skills/async-python-engineering/SKILL.md
  -> exit 0   "ignored"       THE ACTUAL ANSWER: FAIL
```

**All nine authored skill directories in this repository are tracked.** So the
plain form answers PASS over a pattern that would silently stop protecting them
— and it does so for every file the repository guards most, because *tracked* is
what guarded means here. A `Prove:` block written with the plain form is a cell
that cannot go red, in the document whose job is proving the change.

**WRITE THE SECOND HALF, NOT THE FIRST.** The eye-catching detail is that `-v`
prints a line for a NEGATION match too, so "produced output" is not "is
ignored" — `.claude/settings.json` untracked prints `!.claude/settings.json`
while `-q` exits 1. That is a property of one flag. **The lesson is that this
instrument cannot check the very files a repository protects**, and `--no-index`
is what asks the question the author meant. The `-v` detail is also
index-dependent in the opposite direction: for the SAME path TRACKED, `-v`
prints NOTHING. Two correct measurements taken in two index states, which is
exactly how the disagreement that surfaced this arose.

**Not the fifth mechanism.** There the instrument never read the artifact — a
hardcoded source list, a green computed from a different file. Here it reads the
right artifact, at the right path, and answers a DIFFERENT QUESTION about it:
*is this path ignored in practice, given what is already tracked?* rather than
*what do these patterns say?* Both questions are legitimate and the tool answers
the first by default. **The fifth is a wrong target; this is a wrong question
about the right target**, and no source list can fix it.

**Not the ninth.** The haystack is not empty — the path exists, the patterns
exist, the comparison is real. It comes out wrong for a reason that is
documented behaviour.

**The disproof that finds it is one line:** run the same path under a pattern you
know is broken and require the two flag forms to DISAGREE. If they agree, the
cell you are about to trust is not reading the patterns at all.

### MECHANISM 14 — A SET CHECK THAT PASSES ON EXCESS

The phase check in P-GUARD's brief originally required the two commits' file
sets to have an **EMPTY INTERSECTION**. That is a real property and it catches a
real defect: the same file edited by both commits, which is the case where a
two-commit phase goes wrong. **It is blind to a file appearing in NEITHER
declared set.** A commit that also swept in a pile of unrelated untracked paths
has a perfectly empty intersection with the other commit and passes completely.

**THE GENERAL FORM, and it is not about git.** A containment test and a
disjointness test both ask **WHAT IS PRESENT**. Only **EQUALITY** asks **WHAT IS
IN EXCESS.** Any check whose real question is *did anything extra get in here* —
a staging set, an allowlist, a serialised payload, a migration's touched tables,
a response body's keys — is answered by equality and is not answered by either
of the other two, however carefully they are written.

**Measured at the time the check was written:** 152 untracked files in this tree,
`git add *` pre-approved in `.claude/settings.local.json` so a sweeping stage
raises no permission prompt, and a check that would have reported the result
clean.

**Not the third mechanism.** There the failing state is unreachable from the
inputs supplied. Here it is trivially reachable — one `git add -A` reaches it —
and the check simply does not express it.

**Not the twelfth.** There the cell was sound and the prediction about it was
wrong. Here the prediction was right (a wrong file set must redden this) and the
CELL was wrong: it tests a weaker relation than the sentence above it claims.

### THE THIRD DATUM, AND IT ARRIVED INSIDE THE PROBE BUILT TO PROVE THIS PHASE

The `Prove:` block for this phase requires a SECOND INSTRUMENT: `git add -A`
inside the fixture, whose staged list must contain no third-party path. Its
first run printed:

```
STAGED=1  THIRD_PARTY_STAGED=0
```

The one staged path was `.gitignore`. **The fixture had already committed every
authored file, so `git add -A` had nothing to stage and the instrument decided
nothing.** `THIRD_PARTY_STAGED=0` was true, and carried no information — **the
ninth mechanism, in the instrument written to prove a phase about instruments
that carry no information.** Repaired by creating new files on BOTH sides first
(one inside an authored skill, two third-party) and by running the same stage
under case A as a control: `STAGED=10  THIRD_PARTY_STAGED=8`. Only with that
control on the page does the zero above it mean anything.

**This is why the pair is the finding and not a coincidence of timing.** Three
instances in one phase, all in the proving apparatus rather than in the thing
proved.

### Three more, appended to How to apply

22. **Ask what QUESTION your instrument answers by default, not just what
    artifact it opens.** Rule for the fifth mechanism is *which paths does it
    read*; this is one level in from that. A tool can read exactly the right file
    and answer a neighbouring question — `check-ignore` asks about the index,
    `git status` asks about the working tree normalised, a linter asks about the
    files it was handed. **Where a flag switches the question, name the flag in
    the cell and say which question you meant.**
23. **When the real question is "did anything EXTRA get in", only equality
    answers it.** Write the check as *this set EQUALS that set* and never as
    *this set contains* or *these sets are disjoint*. Both weaker forms are
    satisfied by the excess you are looking for.
24. **A `Prove:` block is not exempt from this file, and nothing runs it.** Code
    gets a red eventually; a proof document gets one only if a person reads it
    adversarially before it is dispatched. **Read your own `Prove:` block asking,
    of each cell, what state of the world would make this print PASS while the
    change is broken** — and treat a cell whose answer is "none I can construct"
    as unfinished rather than as strong.

## A FIFTEENTH MECHANISM (P-OUTBOXREVIEW, 2026-08-18) — THE CONTROL WAS BUILT OUT OF THE EXPRESSION THAT FAILED, SO IT SUBTRACTED THE SAME BLIND SPOT FROM BOTH SIDES AND AGREED WITH ITSELF

Every mechanism above is about an assertion. **This one is about a POSITIVE
CONTROL — the thing this file tells you to add — and it is the case where adding
one does not help, because the control is computed by the same expression whose
failure it exists to detect.**

**The instrument.** `tools/verify_citations.ps1` parses `` `FILE § Section` "handle" ``
out of a set of source documents and asserts each resolves to exactly one place.
Its header names the failure it fears, and it is this file's first mechanism: the
parser silently stopping. It had already happened once — the section mark written
as a literal character in a BOM-less `.ps1` read as codepage 874, `CITATIONS=3`
where 36 were present, **exit 0**. So a control was added, and it is a good one:

    SECTIONS - the number of section-bearing citations parsed must equal the
    number present.

**The defect.** Both parsers spell a filename `[A-Za-z0-9_/\.]+\.(?:md|json)` —
letters, digits, underscore, slash, dot. **No hyphen.** So a citation naming a
hyphenated file does not fail to resolve; it is never seen. It is not BROKEN, it
is not counted, and nothing anywhere prints a number that moved. Every file under
`lessons/` is hyphenated.

**AND THE CONTROL CANNOT FIRE, BECAUSE THE CONTROL IS THAT REGEX.** The expected
count is built with the identical class:

    $sectExpected = ([regex]::Matches($text, '`[A-Za-z0-9_/\.]+\.(?:md|json)\s*' + $S)).Count

so an invisible citation is missing from the EXPECTED number and from the PARSED
number in the same breath, and `$sectSeen -eq $sectExpected` holds exactly as
well over a corpus it cannot see. The second control — a source must yield at
least one citation — asks a question this defect never makes false: a document
with twenty parseable citations and three invisible ones is not empty. **Two
positive controls, one of them written for this precise failure mode, and neither
has a state in which it goes red.**

**What actually caught it was arithmetic, and only because the number was small
enough to hold in a head.** Four citations were written into one file; the
checker's count for that file rose by **three**. Nothing was red. Nothing was
missing from the output. The only evidence that existed was a subtraction nobody
was asked to perform.

**TWO INDEPENDENT MEASUREMENTS, MONTHS APART, AND NEITHER COST ANYTHING — WHICH IS
THE POINT.** At `bcd4d40` the defect was measured once already, from the other
direction: hyphenated `.md` paths inside backticks across the then-checked
sources numbered **129**, and in genuine citation form — a path followed by the
section mark — the count was **ZERO**. *(Taken at `bcd4d40`, recorded here, and
deliberately NOT re-taken.)* At `e6249f6`, on a tree carrying no modified tracked
path, a second pass over the 25 tracked documents that cite into `ROADMAP.md`,
`OPEN_ITEMS.md` or `PROJECT_STATUS.md` parsed **435 citations naming 14 distinct
target files, not one of them hyphenated**. So the blind spot is LATENT and has
always been: every document here reaches a lesson through `lessons/README.md`,
which has no hyphen. **Nothing has ever gone unchecked because of it.** The
instrument has been correct about everything it was ever pointed at, and it has
never been able to say so.

**THAT IS WHY IT IS A LESSON AND THE HYPHEN IS A QUEUE ENTRY.** A latent tool bug
gets fixed when someone gets to it. What does not get fixed by fixing it is the
HABIT that let a control be written out of the failing expression — and the next
control written that way will guard something that is not latent.

### Why it is none of the fourteen

**Not mechanisms 1–2, *the needle was empty*, and this is the near miss that
matters.** Those are a needle matching EVERYTHING — `startswith(b'')` true for
every input, a vacuous pass. Here the needle matches a correct SUBSET: every
citation the checker reports is real, and every verdict it gives is right. The
defect is entirely in what it never enumerated, so no amount of care over the
assertion reaches it — and, unlike 1–2, the control that would have caught a
needle problem was present and was itself built from the needle.

**Not mechanism 9, *the haystack was empty*.** The collection is not empty and
does not come from a system under test. It is the instrument's own grammar
excluding a subclass of a corpus it read completely, in files it opened and
decoded correctly.

**Not mechanisms 5–6, *the instrument never read the artifact / never read what
points at it*.** Every file was read, byte for byte, BOM consumed, CRLF
normalised. Reading was not the failure.

**Not 13 or 14.** Thirteen is an instrument answering a different question by
default; fourteen is a containment test asked to do equality's job. Neither is
about a control, and this one is about nothing else.

### The two near misses that are NOT in this file, named out loud

**[[a-differential-control-is-only-as-good-as-its-weaker-side]]** is the closest
thing anywhere, because `$sectExpected` against `$sectSeen` is exactly a
"these two must AGREE" check. It does not cover this and the difference is worth
holding: that lesson's fault is an OPERAND the proof supplied itself, and its
remedy is to derive both sides from the real path. **Both sides here ARE derived
from the real text.** What is shared is not an operand but the GRAMMAR, and a
grammar is invisible in a way a literal is not — you can see a hardcoded `5` in a
comparison; you cannot see the strings a regex declined to match.

**[[a-checker-must-not-share-the-code-it-checks]]** Bound 1 has the RIGHT REMEDY
and the wrong scope. *Duplicate the arithmetic, never the convention* is precisely
what was needed: count the expected citations by a second, independent route and
the two would have disagreed the day a hyphen appeared. But that lesson's subject
is a checker recomputing a value PRODUCTION code computes, and this is a control
recomputing a value THE CHECKER computes — one level in, where nobody was looking.
**A remedy filed under a scope that does not reach your case is not available to
you**, which is the practical half of why this is written here.

### Two more, appended to How to apply

25. **A positive control must not be built from the expression it controls.** Ask
    of every control: *if the thing I fear happened, would this number change?* If
    the control and the suspect share a regex, a parser, a column list, a glob or
    a key space, the answer is no, and the control is a second copy of the failure
    wearing the word "control". Derive it by a route that could disagree — count
    the raw candidates before parsing, count the corpus a different way, or count
    by hand once and pin it to a commit.
26. **When you add N things to something an instrument counts, read the count and
    subtract.** It is the cheapest control there is, it needs no code, and it is
    the only one that caught this. A count that rose by less than you added is a
    class the instrument cannot see — and a class it cannot see is one it will
    never call broken.

## A SIXTEENTH MECHANISM (P1.18 stage 2, 2026-08-18) — THE SECTION HALF OF THE ELEVENTH, AND IT BREAKS ON A HEADING NOBODY WAS CITING

**The eleventh mechanism is about a HANDLE going ambiguous. This is the SECTION
side of the same instrument, and it is worse in the one way that decides whether
anybody notices: a section is matched by SUBSTRING and CASE-INSENSITIVELY, so
the colliding text need not equal the cited name, need not be near it, and need
not be about the same subject.** The person who breaks it is writing new prose
and is not thinking about citations at all.

### What the checker actually does with a section

`tools/verify_citations.ps1` resolves `` `FILE § Section` `` like this:

    $sh = @($tlines | Select-String -SimpleMatch -Pattern $sect |
            Where-Object { $_.Line -match '^#{1,4} ' })
    $sHits = $sh.Count

Two properties, neither of them written down anywhere before this amendment:

- **`-SimpleMatch` turns off the REGEX, not the substring search.** It means "the
  pattern is a literal", and `Select-String` still reports any line CONTAINING
  it. A heading equal to the section name and a heading merely containing it are
  the same event to this instrument.
- **`Select-String` is CASE-INSENSITIVE by default.** `-CaseSensitive` is not
  passed. So `STAGE 2` and `stage 2` are one string here.

### What happened

Writing this step's design meant appending twelve `####` headings to a file that
five other documents cite. One of them read:

    #### THE DESIGN — stage 2, and it produces no drain

`ROADMAP.md` has carried `# STAGE 2 — what the pilot teaches, and what gets fixed
because of it` since long before, and `OPEN_ITEMS.md` cites it by section. The
citation immediately reported:

    12  BROKEN  ROADMAP.md  sect=STAGE 2  hits=2 L2005,2757  handle="A standing reconcile against the shop's real data" hits=1 L2778

**Nothing at either end of that citation was touched.** The cited heading is
unchanged and still at `:2757`; the handle still resolves at 1. What broke it is
a THIRD line, in the cited file, written by somebody with a different subject, in
a different case, at a different heading level. The whole-repository count went
`BROKEN=6` to `BROKEN=7`; renaming the heading to `#### THE OUTBOX DESIGN — and
it produces no drain` took it back to 6, the identical six.

### THE NEAR MISS, AND IT IS THE REASON THIS IS WRITTEN DOWN

**The documented way to run this checker would have printed `BROKEN=0` over the
broken repository.** Its `param()` default is
`@('START_HERE.md', 'ARCHITECTURE.md')`, its own header shows exactly that
invocation twice, and **neither file cites `ROADMAP.md § STAGE 2`** — measured,
`grep -Fc 'ROADMAP.md § STAGE 2'` returns 0 for both and 1 for `OPEN_ITEMS.md`.
The break was seen only because the run named five sources.

That is the SIXTH mechanism, arriving by addition rather than deletion, and its
remedy — *run every source, never the file you are editing* — is the only thing
that caught it. **A remedy already in this file is not a remedy you will apply**
unless something tells you the case is yours; the sixth mechanism is written
about DELETING a heading, and nothing was deleted here.

### Why it is none of the fifteen

**Not the sixth.** That one is a heading DELETED, so the citation's target
genuinely ceased to exist. Here the target exists, is correct, and is found —
found twice.

**Not the eleventh, which is its nearest sibling and shares its remedy's shape.**
That one is about a HANDLE that is ambiguous by construction because a lesson's
filename appears both on its index line and in cross-references, and its repair
is to choose a more distinctive handle. **A section name is not chosen by the
citer to be distinctive — it is the heading somebody else wrote**, and no amount
of care at the citing end helps, because the collision is created later, by a
writer who never reads the citation. The eleventh's other half does carry over
and is worth keeping: `BROKEN` prints the same word for `hits=0` and `hits=2`,
so a reader scanning that column goes looking for a heading that is not missing.
**The line numbers are the tell** — `L2005,2757`, two of them, printed right
there. Read the numbers, not the word.

**Not the fifteenth.** No control was built out of the expression it controls;
both positive controls held and correctly reported 114 sectioned citations parsed
of 114 present. The instrument was entirely healthy and said so.

### What to do

- **Before adding a heading to a file other documents cite, list what they cite
  in it.** The cheapest route is the checker's own output: run it over every
  source once, and read the `sect=` column for the file you are about to write
  in. Then check the heading text you are about to add against that list,
  case-insensitively and as a SUBSTRING. The question is not "does my heading
  equal one of these" but "does any of these appear anywhere inside my heading".
- **Prefer a heading that could not contain a section name.** The collision here
  was two ordinary words and a digit. A heading naming its own subject —
  `THE OUTBOX DESIGN` — cannot collide with a heading naming a delivery stage,
  and that is a cheaper defence than a grep somebody has to remember.
- **Run the checker over every source before and after, and subtract.** Both
  numbers matter: `BROKEN` must not rise, and `CITATIONS` must rise by exactly
  the number of citations you wrote. Here it went 355 to 366 for eleven written,
  which is item 26 above doing its job on the other side of the same run.

### Two more, appended to How to apply

27. **A section citation is a substring match, so the blast radius of a NEW
    heading is every citation into that file.** Ask of any heading you add: could
    this text contain, anywhere inside it and in any casing, the name of a
    heading somebody cites? Adding is as dangerous as deleting, and it is far
    less obviously dangerous, because nothing you can see is being removed.
28. **A break can appear under a source you did not edit, so the file you
    changed is the one place it cannot show.** When an instrument attributes
    findings to a SOURCE, changing a TARGET moves the finding to somebody else's
    row. Run every source, and read the whole table rather than the row with your
    filename on it.

### EXTENDED (P-OWNERDECIDED, 2026-08-20) — WHEN THE HEADING TEXT IS A LABEL, THE REMEDY ABOVE DOES NOT EXIST

**This is the same mechanism, not a new one — the count at the head of this file
stays at sixteen.** What is new is that *"prefer a heading that could not contain
a section name"* is sometimes **unavailable**, and this repository's own numbering
guarantees it will keep being unavailable.

**The instance.** Four stage-1 steps were minted into `ROADMAP.md` as `P1.19`
through `P1.22`. `P1.2` is a cited section, and `### P1.20`, `### P1.21` and
`### P1.22` each CONTAIN it as a substring — so `` `ROADMAP.md § P1.2` `` went from
`hits=1` to `hits=4` **with neither endpoint's text edited**, exactly as the
sixteenth mechanism describes. The heading text could not be chosen differently:
it is a LABEL fixed by sequence, and renumbering to dodge the collision is
forbidden here for the reason that closed the `A`- and `R`-numbers — it orphans
every existing reference.

**THE GENERAL FORM, AND IT IS A PROPERTY OF THE LABEL SPACE RATHER THAN OF ANY
HEADING.** A decimal label space generates substrings of its own earlier members
the moment it crosses ten. `P1.2` is a prefix of `P1.20`–`P1.29`; `P1.1` is a
prefix of `P1.10`–`P1.19`. **`P2.1` and `P3.1` will do the same the day those
stages cross ten**, and nothing will announce it.

**AND IT IS ALREADY WORSE THAN THE INSTANCE THAT CAUGHT IT — MEASURED 2026-08-20,
WITH ITS CONTROL IN THE SAME PASS.** `grep -cE '^#{1,4} .*P1\.1' ROADMAP.md`
returns **11** heading lines containing `P1.1`: the step itself plus `P1.10`
through `P1.19`. **So `` `ROADMAP.md § P1.1` `` has been unresolvable since `P1.10` was
minted, and nobody has noticed** — because nobody cites it. The control is the
same run's positive half: `` grep -rnoE 'ROADMAP\.md § P1\.[0-9]+`' --include='*.md' . ``
returns **15 sites at exit 0**, naming `P1.7`, `P1.12`, `P1.16` and `P1.18`, and
**not one naming `P1.1`**. The instrument fires; the label is simply uncited.

**THAT IS THE SENTENCE WORTH KEEPING: the label space is already broken, and what
is holding it up is WHICH LABELS HAPPEN TO BE CITED.** `P1.19` breaks nothing —
**by luck, not by design.** The next mint may not be lucky, and the luck is
invisible from the diff.

**What to do, since the heading cannot move.**

- **Grep the CITED SECTION NAMES for any that your new label CONTAINS, not for
  the new label itself.** Before minting, `P1.20` returned nothing across every
  tracked markdown — measured, exit 1 — and the break was real anyway, because
  the label that breaks is `P1.2`. Searching for what you are about to write is
  the wrong direction.
- **Cite the FULL heading, never the bare label.** The repair here was widening
  both sites to `` `ROADMAP.md § P1.2 — A server a shop can reach` ``, which
  cannot be a prefix of a sibling: after `P1.2` the cited form continues with the
  em dash and the sibling continues with a digit. **A bare-label section citation
  is a citation waiting for its tenth sibling.**

**AND THE SHARPEST DATUM OF THE WHOLE EPISODE — THE FIFTH MECHANISM, INSIDE THE
FILE THAT DOCUMENTS THE FIFTH MECHANISM.** Writing the two paragraphs above
MANUFACTURED two more of the defect they describe: the strings naming `P1.2` and
`P1.1` were first written in SINGLE backticks, which is citation form, so this
file now carried a citation resolving to four heading lines and another resolving
to eleven. **Nothing went red, and nothing could have**, because `lessons/` is not
in `verify_citations.ps1`'s `-Source` list — the checker never opens these files,
so a broken citation written INTO a lesson is invisible by construction. That is
the fifth mechanism exactly: *ask what paths a checker OPENS, never what it is
named*. They were escaped to double backticks, which is what
`a-label-is-a-reference-with-no-checker` already does at its own site, and the
sentences are unchanged.

**Two consequences, and the second is the uncomfortable one.** A citation written
in a lesson is unverified today and becomes REAL the day anyone adds `lessons/`
to the source list — so this directory accumulates latent breaks that the act of
adding coverage would reveal all at once. And the file most likely to contain
citation-shaped prose is THIS one, because describing a citation defect means
writing citations down. **When you write about a broken citation, escape it, or
you have written another one** — which is the rule
`OPEN_ITEMS.md § Documentation` reached independently in its own words, *"a broken
citation written in citation form is parsed, counted, and raises `BROKEN`, so
describing the problem manufactures more of it"*, one directory away and about
files the checker DOES read.

## A SEVENTEENTH MECHANISM (P-SHEETFIRSTPRESS, 2026-08-23) — THE DISPROOF WAS NEVER ARMED, AND THE HARNESS PRINTED THAT IT HAD BEEN

**Most** mechanisms above are about an ASSERTION — one that cannot fire, or fires
about something adjacent. **Seven are not, and naming them is what makes the
boundary legible**: the first and second are an INSTRUMENT with an empty needle,
the fifth and sixth an instrument reading the wrong artifact or nothing that
points at it, the thirteenth and fourteenth a check answering a neighbouring
question and a check that passes on excess, the fifteenth a CONTROL built out of
the expression it exists to catch. Every one of those seven is the apparatus that
MEASURES.

**Only two above are about the apparatus that DAMAGES**, which is what this one
is, so those two are its neighbours and the third mechanism is not: the FOURTH,
where eight mutations were eaten by the compiler, and the EIGHTH, where a probe's
stimulus stopped being delivered. A future member of this family is swept by
those three numbers.

**The measurement.** `mobile/src/proof/proveSheets.ts` accepts five deliberate
breaks. Its selector was:

```ts
const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
```

Nothing compared `BREAK` against the five. Every wrapper asks `BREAK === "coexist"`
and so on, so an unrecognised value simply matches nothing and the model stays
UNDAMAGED — and then `main()` prints, unconditionally on `BREAK !== ""`:

```
  *** NEGATIVE CONTROL ACTIVE: --break=coexsit ***
      The model is damaged ON PURPOSE by this script, never by src/ui/. Cells
      that measure the invariant must go red.
```

Measured on 2026-08-23, one letter transposed:
`npm run prove:sheets -- --break=coexsit` printed that banner, then
`ALL CELLS PASSED`, `PROVE_SHEETS_EXIT=0`, exit 0. The correct spelling reddens
S2 and S7. **The operator supplied the right intent, the harness discarded it
without a word, and then told them it had been accepted.**

**Three files, not one, and the sweep is by CONSTRUCT.**
`grep -rln 'startsWith("--break=")' mobile/src/` returns exactly three —
`proveSheets.ts`, `proveSellerCreate.ts`, `proveSellerNotice.ts` — byte-identical
selectors, each with its own banner. Control in the same pass: eight files under
`mobile/src/proof/` touch `process.argv`, and the other five are positional
crash-children plus one boolean `includes("--offline")`, which mis-parses just as
silently but ANNOUNCES NOTHING, so it cannot tell anybody a control ran.

**NOT THE THIRD MECHANISM.** There, `pending: 3` with `engine: null` makes the
failing state UNREACHABLE FROM THE INPUTS SUPPLIED: the operator handed in
something that could not produce the case they meant to test, and the instrument
reported honestly on what it was given. Here the input was RIGHT — the operator
asked for exactly the break that works — and the harness DISCARDED it between the
command line and the model. The third is a badly chosen input; this is a
correctly chosen input silently dropped.

**NOT THE FOURTH, and this is the closer of the two real neighbours.** There the
mutation also never reached what it was meant to damage — eight substitutions
were all `TS2322` and the build stopped. But that interception is LOUD: nothing
ran, no cell was observed, and the author could see that no proof had executed.
Here everything ran, every cell was observed, and the run ended `ALL CELLS
PASSED` at exit 0. **A break the compiler eats leaves no result to misread; a
break the harness swallows leaves a full green one.**

**NOT THE EIGHTH, AND THAT ONE ALREADY CARRIES THE HALF THAT LOOKS NOVEL HERE —
say so rather than claim it.** The X3 probe's stimulus stopped being delivered
and the probe went on *"still printing `inserted tenant … mid-run`"*. So the
apparatus asserting in words that it did the thing it did not do is NOT new to
this file, and an earlier draft of this section claimed it was. What separates
them is the ROUTE IN and therefore the REPAIR. The eighth **arrived with no edit
at all** — nobody mistyped anything, the proof was correct as written, and a
database rebuilt from 46 tenants down to 2 moved the world under it, taking the
report under the 8192-byte buffer that had been flushing it; its remedy is a
synchronisation point you control. This one is available to ANYBODY, on EVERY
run, DETERMINISTICALLY, from one transposed letter, and has been since the
selector was written — because the harness never had a notion of which values it
accepts; its remedy is a CLOSED SET of accepted inputs. Timing that drifted
against a domain that was never defined. Neither remedy reaches the other's
defect.

Not the twelfth either: there the break WAS applied and the cell was aimed at a
granularity the damage did not reach. Here the break never happened.

**The repair, and the placement is the whole of it.** Each file now declares its
own modes and refuses anything else AT MODULE SCOPE, above the first
`console.log`:

```ts
const BREAK_MODES: readonly string[] = ["coexist", "two_hosts", "always_push", "pop_all", "scan"];
if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) { /* print, then */ process.exit(2); }
```

**EXIT 2 AND NOT 1**: in this suite 1 means assertions failed and 2 means the
check could not run, which is what `prove:forbidden --offline` and `reconcile.py`
already mean by it. A break that was never applied measured nothing, so 1 would
claim a measurement that did not happen.

**VALIDATE BEFORE THE PRINT, NOT INSIDE `main()`.** A guard beside the banner
still lets a rejected value announce itself on the way out; the sentence is half
the defect and it has to be unreachable, not merely followed by an exit.

**AND THE PAIR IS THE EVIDENCE, NOT THE REFUSAL.** A validator that refuses
everything is not a fix and passes the same test as one that works, so each file
was run twice: the misspelling must exit 2 WITH NO BANNER, and the known value
must still raise the banner and still redden the same cells. Measured —
`--break=coexsit` exit 2, banner count 0 over a 15-line output;
`--break=coexist` exit 1, banner count 1, and S2 still reading
`asks for 2 — seller_picker + add_seller`. The zero is controlled by the output
being non-empty, because a banner is absent from an empty file too.

**It fails closed when the list rots**, which is the one thing that makes this
maintainable: add a wrapper and forget the list, and the new break is refused BY
NAME at exit 2 rather than silently ignored — loud, in the direction that cannot
be mistaken for a pass.

Ask of any test harness, not just its assertions: **if I asked for a mode that
does not exist, would this program tell me, or would it tell me the mode was
on?**

---

**SOURCE:** `a-checker-must-not-share-the-code-it-checks.md`

# A checker must not share the code it checks — and must not reach past it

**Applies to** any reconciler, invariant check, audit script or assertion that
re-computes a value the production code already computes; and to any test that
breaks something on purpose in order to prove a check catches it.

One subject, three bounds. The first two pull in OPPOSITE directions; the third
arrived later and is amended in at the end. Get any of them backwards and the
result is a checker that is silently useless — the worst kind, because it prints
a green.

---

## Bound 1 — duplicate ARITHMETIC, never duplicate a CONVENTION

`server/scripts/reconcile.py` has to answer two questions that look identical
and are not:

* does `item.amount` equal `net_weight × unit_price`?
* does the Buddhist-era year inside `doc_no` match the year the bill arrived in?

**The arithmetic is duplicated on purpose.** The checker evaluates
`round(net_weight * unit_price, 2)` in Postgres NUMERIC. `bills._line_amount`
evaluates `Decimal.quantize(ROUND_HALF_UP)` in Python. Two implementations, two
engines, one specified answer — both round ties away from zero, and every value
is non-negative by CHECK, so they MUST agree. **A checker that imported
`_line_amount` would agree with a bug in `_line_amount`.** It would confirm that
the code equals itself, which is true of every program ever written.

**The convention is NOT duplicated.** `_be_year` is imported from `bills.py` —
the same function `doc_no` itself is built from. Writing
`extract(year from x AT TIME ZONE '+07') + 543` in the checker's SQL would have
been a second derivation of a choice, not a second computation of a fact. There
is no independent authority on which timezone a shop day belongs to; there is
only the decision, recorded in one place. A copy of it is correct-by-luck for
most of the day and wrong across Bangkok midnight — which is the whole of
[[be-year-comes-after-the-timezone]], **and whose amendment is precisely this
failure**: the rule was applied to production and the code that CHECKS it was
never swept.

The test that separates them:

> **Could a second competent author, given only the specification, arrive at the
> same answer?** For arithmetic, yes — so duplicate it, and let the two disagree
> when one is wrong. For a convention, no — they would arrive at *an* answer,
> and it would differ at the boundary neither author tested. Import it.

Getting it backwards fails in both directions, and both are silent:

| mistake | what you get |
|---|---|
| checker imports the arithmetic | agrees with the bug. Green forever. |
| checker re-derives the convention | red every new year over a defect that does not exist — or green over one that does, because the copy and the original are wrong the same way |

The second row is the dangerous one. A checker that cries wolf annually gets
switched off, and a checker that is switched off is worth less than none,
because someone believes it is watching.

## Bound 2 — a destructive proof must not be able to reach past its copy

`prove_reconcile.py` breaks each invariant on purpose in a RESTORED COPY and
asserts the checker catches it by name. One check could not be proven this way,
and the reason is the lesson:

**S5 asserts `recycle_app` is NOSUPERUSER + NOBYPASSRLS. The only way to make it
fire is `ALTER ROLE recycle_app BYPASSRLS`. ROLES ARE CLUSTER-WIDE.** The live
database shares the cluster with the copy, so that one statement would disable
tenant isolation on real money data for as long as the injection ran — and leave
it disabled if the script died in between. `ALTER TABLE ... DISABLE ROW LEVEL
SECURITY` is database-scoped and safe; `ALTER ROLE` is not. They sit one line
apart in any injection list and look equally harmless.

So: **know which of your objects are scoped to the database and which to the
cluster, before writing anything that breaks them on purpose.** Roles,
tablespaces and cluster settings are shared. A "restore into a scratch database"
does not sandbox any of them.

The check was left UNPROVEN BY EXECUTION and labelled as such in the output,
rather than proven dangerously or dropped quietly. And the reason is enforced
mechanically — the harness scans every injection's SQL for `ROLE` statements and
refuses them — because a reason that lives only in a comment decays into a
comment nobody reads.

---

## The corollary that made both bounds visible

An injection test only means something if the invariant is **clean before and
clean again after**. Assert three things per injection, never one:

1. the check fires, with the expected count;
2. the report NAMES the actual row (assert against the human report, not a
   machine format — "it must scream" is a claim about what a person reads);
3. **undoing the injection returns the database to a clean run.**

Without (3) a checker whose red never clears, or whose green is sticky, passes
the whole suite. Nineteen injections here each carry all three, and (3) is what
turns them from nineteen assertions into nineteen *measurements*.

See also [[proof-must-run-twice]] — a proof that MUTATES its own fixture must
restore that fixture itself, or its second run measures its first run.

## Amendment (sign-out proof, R1): Bound 3 — the expected value must not come from the subject

Bounds 1 and 2 are about the checker's CODE. This one is about its VALUE, and it
survives every fix the other two ask for: a checker can share no code at all with
what it checks and still be worth nothing, because the number it compares against
was fetched from the thing on trial. Three instances, three languages, one shape.

**1. `mobile/src/proof/proveSignOut.ts:273-304` states it in its own words**, in
the comment left standing where the defect was:

> This used to compare what the applier wrote against CLEARED_SESSION itself,
> which proves PASS-THROUGH and nothing more: the applier reads that same
> object, so the two agree by construction and every cell stays green whatever
> the constant is changed to. Eight of the ten values were unpinned in exactly
> that way — only token (through sessionStateOf, below) and online (=== null)
> had an assertion that could fail.

Ten values, eight of them unfalsifiable. No line of the assertion was wrong. The
expected side simply came from the subject, so `S2` was a real test of "the
applier writes every key exactly once" and simultaneously no test at all of WHAT
it writes. The fix is the boring one: the expected values are now literals in the
proof file, each carrying where in `src/` the specification says that value.

**And the mutation test did not fire — for a reason that is its own trap.** All
eight were substituted in `CLEARED_SESSION`, one field per run, to a
wrong-but-plausible value. Every one was a COMPILE error — `TS2322` at
`signOut.ts`, *"Type 'true' is not assignable to type 'false'"* — so the build
stopped and the proof never ran. **A mutation the compiler catches first has not
tested the runtime check.** The literal types are a real guarantee, and a
different one; what the proof adds is the single case `tsc` cannot see, the
interface literal and the constant widened TOGETHER.

**2. The definition can come from the subject too, not just the value.**
`proveSync.ts:603`, `:666` and `:888` each assert `queueHealth`'s `.offline`, and
each is correct for the input it sends. The function is still wrong on an input
none of them sends. `queueHealth.ts:302`:

```ts
const offline = blocking && !serverRefusing;
```

`serverRefusing` is `head.first_server_error_at !== null` (`:300`), and
`markSessionExpired` (`SqliteLocalStore.ts:361`) sets `first_server_error_at =
NULL, server_error_attempts = 0`. So a queue jammed by a dead token has
`blocking` true and `serverRefusing` false, and reads as OFFLINE — "waiting for
the network", on a device whose network is fine.

The proof shares no code with `queueHealth`; it imports it and calls it, which is
what a proof should do. What it inherited is the SUBJECT'S DEFINITION of the
property. Proof and function were written together from one idea of what
"offline" means, so they agree about the three cases that idea covers. A second
author given only the specification — *offline means the device cannot reach the
server* — would have asked what happens when the server answers 401, which is
Bound 1's test pointed at a definition instead of at a formula. **A green here is
a claim about coverage, and nothing in the output says so.** It reaches no screen
today; that is why it is latent, and not why it is acceptable.

**3. Same shape outside any language with types.** A CR-counting check at this
terminal ran `grep -c $'\r'` inside a `for` loop. `$'\r'` reached grep as an
EMPTY pattern, an empty pattern matches every line, and the count came back equal
to each file's line count. It was read as a CR count. The number was real, it was
just a property of the subject echoed back — a measurement that returns its own
input. (Not recorded in this repo: no `.sh` file and nothing in `git log`. It
happened in a session, and is written down here because that is the only place it
now exists.)

The test, and it is not the same question as Bound 1's:

> **Where did the expected value come from — and could a wrong subject have
> produced it?** Write it down by hand from the specification, never from the
> object, the constant, or the function under test. Then break the subject and
> watch the cell turn red. If it stays green, or if something upstream — a
> compiler, a literal type, a build step — stops the break from ever reaching the
> assertion, then the cell has not been observed.

That last clause is the general rule and it has its own file:
[[a-check-that-never-went-red-was-never-observed]] — Bound 3 is the case where
the un-fireable assertion got its value from the subject; that lesson covers the
ones where it had no value to get. Its sibling on the production side is
[[a-defaulted-getattr-is-a-silent-dead-branch]]: a branch nothing was ever seen
to enter, for the same reason a cell nothing was ever seen to redden.

---

**SOURCE:** `a-column-that-describes-content-must-follow-a-rewrite.md`

# A column that describes the row's CONTENT must follow a rewrite; one that records its ORIGIN never may

**Applies to** every `ON CONFLICT ... DO UPDATE` list, and to every other place a
row is rewritten in part — an upsert, a partial UPDATE, a merge, a sync that
reconciles a local row against a server one. The question is always the same and
it is never "which columns changed": **does this column describe WHAT THE ROW NOW
HOLDS, or WHERE THE ROW CAME FROM?** Content follows a rewrite. Origin never does.

Getting it backwards is silent in both directions, and the two failures look
nothing alike, which is why the rule has to be stated as one rule rather than
learned twice.

## Three upserts, one directory, and they do not agree

`mobile/src/adapters/sqlite/` holds three `DO UPDATE` lists. All three carry a
tenant or a user id. Two must carry it forward and one must not. Nothing about
their shape says which is which.

| statement | the identity columns | why |
|---|---|---|
| `master_cache` ON CONFLICT (kind) — `SqliteMasterStore.ts` | **carried forward** | the row describes WHICH SHOP the cached list currently belongs to |
| `local_identity` ON CONFLICT (only_row) — `SqliteIdentityStore.ts` | **carried forward** | the row describes WHO IS SIGNED IN NOW |
| `local_draft` ON CONFLICT (id) — `SqliteDraftStore.ts` | **deliberately absent** | the pair records WHO OPENED this cart, a fact about the past |

Read as "the owner columns", the third looks like an oversight beside the other
two. Read as "the origin of the row", it is the only one that is right.

## Both failures, and neither raises anything

**OMITTING IT WHERE IT IS CONTENT.** `master_cache` is keyed on `kind`, so a
handset that changes shops UPDATES the existing `'products'` row rather than
inserting one. Set only `fetched_at` and the OLD shop's tenant stays on a stamp
that now describes the NEW shop's rows. The reader compares the stamp's tenant
against the signed-in one, they differ, and a refresh that has just succeeded
reports the cache as ABSENT — blocking a yard whose data is perfectly good. The
opposite of the failure the column was added for, reached by the same line.
Caught by reading while writing `8ec784e`, not by a green.

**INCLUDING IT WHERE IT IS ORIGIN.** `local_draft` saves on a keystroke. List the
owner in the DO UPDATE and the next character typed after a shift change
silently reattributes the cart to whoever is signed in now, erasing the fact that
somebody else opened it — and nothing on the device would ever show that it
happened (`ARCHITECTURE.md` section 11). `proveOwner.ts` O4 exists for this and
asserts the row still records the opener after a later save under another
identity; recorded at `0ac09ef`.

Note what the two have in common: **no error, no exception, no failed write.**
One quietly withholds good data, the other quietly rewrites provenance. Both are
one line in a list that reviewers read as a formality.

## The test

Ask of the column: **if this row's DATA were rewritten wholesale tomorrow, would
this value still be true of it?**

- A tenant on a cached price list: no — the list would be another shop's, and the
  column must move with it. CONTENT.
- The pair on a draft: yes — somebody opened that cart, and no later edit makes
  that untrue. ORIGIN.
- `master_as_of` on a draft: yes, and it is the same rule again — the column
  records which master data the lines were priced from, which a later refresh
  cannot change retroactively. Already absent from that DO UPDATE list for
  exactly this reason, written up before the owner columns joined it.

The wrong question, and the one that produces both defects, is "does this column
belong to the same feature as the ones above it". `owner_tenant_id` belongs to
the same FEATURE in all three statements and needs opposite treatment in one of
them.

## How to apply

1. **Classify every column in a DO UPDATE list as content or origin, out loud,
   before writing the list.** Not the ones you are adding — all of them.
2. **Write the classification at the statement**, because the next author meets
   the statement and not this file. All three sites above now say which they are
   and name at least one of the others, so a reader comparing them lands on the
   distinction rather than on the apparent inconsistency.
3. **Never copy a DO UPDATE list between tables.** It is the one construct where
   two tables that model the same idea want different answers, and copying
   carries the source's classification silently.
4. **Where the column is ORIGIN, expect a proof that a later write does not move
   it** — a write under a DIFFERENT identity, then a read of the column. A proof
   that only checks the value after the first insert cannot see the defect.
5. **Where the column is CONTENT, expect a proof that a rewrite under a NEW value
   is readable afterwards.** The omission's symptom is a correct write that reads
   back as absent, which no assertion about the write itself will catch.

---

**SOURCE:** `a-control-must-contain-what-fooled-you.md`

# A control must contain the thing that fools the counter

**Applies to** every positive control, every fixture, every hand-built input you
put in front of an instrument before trusting its number — and hardest to a
counter, because a counter returns a plausible integer for almost any input and
never announces which lines it looked at.

**The rule:** a control proves an instrument works ON THE INPUTS THE CONTROL
CONTAINS, and says nothing about any shape it does not. Build the control out of
what the REAL input actually holds, including the parts you were not thinking
about. If the control cannot come out wrong under the mistake you are worried
about, it is not a control for that mistake — it is a control for a mistake you
have already ruled out.

## The instance

Counting the rows of a `restore_db.py` want/got block. The counter:

    grep -c "^  \[" <file>

The control was six lines of exactly the shape being counted, with a blank line
and an unanchored decoy, correct answer **4**:

    [OK  ] alpha        dump=1  restored=1
    [FAIL] beta         dump=2  restored=None
    -- a comment mentioning [OK  ] inline
    [OK  ] gamma        dump=3  restored=3
    (blank)
    [OK  ] delta        dump=4  restored=4

It returned **4**. Anchoring proven, blank-line dropping ruled out, and both of
those conclusions were true. Then the same counter, run against a real restore,
returned **17** where the visible table held **13**.

The real output carries a block the control did not:

    === integrity ===
      [OK  ] database.sql (989 bytes, sha256 verified)
      [OK  ] globals.sql (1225 bytes, sha256 verified)
      [OK  ] recycle.sql (214624 bytes, sha256 verified)
      [OK  ] recycle.sql contains no \connect (safe to retarget)

Four lines, same two-space-then-bracket prefix, different meaning. 13 + 4 = 17.

**The control was not weak. It was about the wrong thing.** Every property it
tested, it tested correctly. It simply contained no line of the shape that
produced the error, so no possible result of running it could have moved.

## The repair, and the shape of the evidence

Put the contaminant IN the control and require the two candidate patterns to
disagree over it:

    [OK  ] database.sql (989 bytes, sha256 verified)          <- contaminant
    [OK  ] recycle.sql contains no \connect (safe to retarget) <- contaminant
    [OK  ] alpha     dump=1  restored=1
    [FAIL] beta      dump=2  restored=None
    [FAIL] gamma     dump=3  restored=MISSING
    -- a comment mentioning [OK  ] and restored= inline
    [OK  ] delta     dump=4  restored=4
    (blank)
    [OK  ] epsilon   dump=5  restored=5

| pattern | control | verdict |
| --- | --- | --- |
| `^  \[` | **7** | wrong — counts both contaminants |
| `^  \[.*restored=` | **5** | correct |

**The evidence is the PAIR, not the green.** A refined pattern returning 5 is
consistent with a pattern that was always right; what establishes anything is the
old pattern returning 7 over the same file. Same discipline as
[[a-gate-that-matches-a-keyword-misses-its-aliases]], which requires ADMITTED
under the old and REFUSED under the new in one table, for the same reason: a
control that only ever sees the fixed version measures the fix's existence, not
its effect.

Note the third line of the rebuilt control, `restored=MISSING`. That shape did not
exist when the counter was first written — it was introduced by a change made
later in the same session. **A control has to be re-opened when the thing it
watches grows a new shape**, which is the same failure with time substituted for
inputs, and is the eighth mechanism of
[[a-check-that-never-went-red-was-never-observed]] — a fixture is an input, and it
is the one input nobody re-reads when it changes.

## How to tell this from an ordinary control gap

Ask what the instrument's real input contains that your control does not, and be
concrete: not "edge cases" but "the four lines of the integrity block". The
question has an answer you can read off the actual output in ten seconds, and it
is the only cheap defence, because the failure produces a number rather than an
error and the number is in the right order of magnitude.

**It is caught by disagreement, not by inspection.** 17 against 13 was noticed
only because a visible table could be counted by eye — thirteen rows are
countable, and had the table held ninety the discrepancy would have shipped. So
where the real answer is not eyeball-checkable, get a SECOND instrument on it: the
same phase counted `COPY` headers with both `grep` and a Python parser and
required them to agree, which they did at 11 and at 13.

## AMENDED — the contaminant can be a RECORD OF A PAST FAILURE

Same mechanism, and the contaminant is the thing hardest to anticipate: **the
artefact's own written account of a previous red.**

Scanning proof output for failures with `$o -match "\[FAIL\]"` reported five
failures from `prove:signout` — beside `EXIT=0`. Both readings were correct.
`proveSignOut.ts:1569-1573` is a prose block recording what a PAST disproof run
printed, verbatim, `[FAIL]` markers and all, kept deliberately because it is the
evidence that a mutation reddens the right cells. The scan matched five lines of
documentation about a failure that had already been fixed. Measured at
`fde2b0c`.

This repository will keep producing that contaminant, because writing a
disproof's output into the file is the practice these lessons ask for. **Any text
scan over a proof's source or output is scanning a medium that deliberately
contains examples of the thing being searched for.**

WHAT CAUGHT IT WAS RULE 5 BELOW — a second instrument. The exit code disagreed
with the scan, and the exit code is the authority: it is written by the proof's
own `main()` from its own failure counter, so it cannot be confused by prose. The
scan is a convenience for LOCATING a failure once the exit code says there is
one; it is not evidence that there is one. Reading them the other way round —
believing the scan, doubting the zero — is what turns a green suite into an
afternoon of hunting a defect that was repaired in a previous commit.

Sibling of [[the-observer-is-a-writer-to-what-it-observes]], separated by who
wrote the contaminant: there the instrument writes its own query into the medium
it is measuring; here the medium already held the text, put there on purpose by a
previous author, and the reader adds nothing.

## How to apply

1. **Read the real input before writing the control.** Not the shape you have in
   mind — the actual bytes the instrument will meet, including the headers,
   banners and summary lines around the part you care about.
2. **Put the confusable in.** If two blocks of the output share a prefix, the
   control must contain a line from each, or the control cannot tell them apart
   any better than the instrument can.
3. **Require two patterns to DISAGREE over it.** The naive one and the intended
   one, both run on the control, both numbers reported. If they agree, the
   control still does not discriminate and you have learned nothing.
4. **Re-open the control when the watched thing grows a new shape.** A new status
   string, a new row type, a new section — each is a new input, and the control
   silently stops covering the output the day it appears.
5. **Where the true answer cannot be checked by eye, use a second instrument**
   and require agreement. One controlled counter is an instrument; two agreeing
   controlled counters are a measurement.
6. **State the definition beside the number.** "Lines matching `^  \[.*restored=`"
   is a claim someone can refute; "13 rows" is not.

---

**SOURCE:** `a-default-exit-code-is-a-default-verdict.md`

# A default exit code is a default verdict

**Applies** to every proof, checker and disproof whose verdict is an exit code
the process assigns LATE — in a final `.then`, at the end of `main`, in a
summary block — on any runtime whose natural exit status defaults to success.
Node is the measured case: an UNSETTLED top-level await is not an error. No
throw, no rejection, nothing left that counts as work — the event loop drains
and the process exits with the DEFAULT code, which is 0. Every line of the run
up to the stall prints normally, the verdict line is absent, and the status
that exists to back the verdict says green.

**Measured 2026-08-19**, node v24.13.0, P1.18 stage 3 commit 1. The
leaked-pass-lock disproof starved `proveOutbox`'s gated-void staging: the
transport's first void call never arrived, `await gated.firstVoidStarted`
could never settle, and the process ended cleanly mid-proof. `npm run
prove:outbox` reported EXIT=0 over a log holding NINE `[FAIL]` cells and no
`OUTBOX_EXIT=` line. **A deliberate break — a run whose entire job was to find
which cells move — read as a pass**, and was caught only by opening the log
and registering the exit line's absence.

## Why the existing defences did not reach it

- **"Run it bare and read its own status"** — the machine-footgun family's
  core rule — was FOLLOWED, and the status lied. Nothing had assigned an exit
  code yet, so the process reported its default, and a default exit code is a
  default verdict of success: the same shape config-defaults-must-fail-closed
  records for identity ("a default value is a default IDENTITY"), one layer
  down, about the one value every check in this repository ultimately rests
  on.
- **"The absence of the exit line is the signal"** exists twice already — in
  the restore footgun, and in the never-went-red family's rule that a disproof
  is judged by whether it printed its exit line (named without the filename,
  for that file's own eleventh-mechanism reason). Both are READING
  disciplines, and both were written against artefacts whose exit CODE
  disagreed with the absent line: a Python `fail()` that calls `sys.exit(1)`
  before reaching its print, and a crash. Reading either signal correctly went
  red there. Here the code AGREES with the green the absence invites — both
  signals point the same wrong way — and only a reader who treats absence as
  failure REGARDLESS of the status survives it. A reading rule that must beat
  a contradicting green status is a rule that loses eventually.

## The rule

**Preset the verdict to red before the run starts, and let only a COMPLETED
run write anything else.** `process.exitCode = 1` at entry, cleared by the
final tally and by nothing else. Every path that ends the process without
finishing — the drained event loop included — then exits non-zero, and the
absent exit line is BACKED by a red status instead of contradicted by a green
one. Re-measured under the same break after the preset: EXIT=1, same truncated
log, same absent exit line — the truncation itself is now red. The reading
rule survives as the other half; this is the writing half, which makes the
artefact incapable of the false green rather than asking every future reader
to notice an absence.

## Where it stands

Applied in `proveOutbox.ts`, whose own disproof found it. **Every other proof
in this suite shares the exposed pattern** — verdict assigned in a trailing
`.then`, nothing preset — measured by reading on the same day, and
deliberately NOT swept here: the sweep was outside the commit's declared file
set and is queued. A proof with no staged gate reaches the drain only through
a hang-shaped bug, which is exactly the moment its false green costs most.

## Bounds

- Node's documented behaviour on any machine, not a property of this box —
  the two-homes test sends it here and not to Machine footguns.
- The preset works because node uses the LAST value assigned to
  `process.exitCode` at a natural exit. A literal `process.exit(0)` anywhere
  would still lie; none of these proofs calls one.
- It removes the INCOMPLETE-run false green only. A run that completes with a
  vacuous or misaimed verdict is the never-went-red family's subject, not
  this file's — every assertion in the measured run was sound, and what lied
  was the process carrying them.

---

**SOURCE:** `a-defaulted-getattr-is-a-silent-dead-branch.md`

# A defaulted `getattr` is a silent dead branch

**Applies to:** every place code asks an exception, a driver object, or any
foreign object for an attribute it did not define itself — and to every "safety"
branch that no test has ever been observed entering.

## What happened

`bills.py` handled the idempotency race like this, from Phase 1c:

```python
constraint = getattr(getattr(e, "orig", None), "constraint_name", "") or ""
if "idem" in constraint:
    ...return the winner's bill (200)
```

`constraint_name` **is not on `e.orig`**. SQLAlchemy's asyncpg dialect does not
hand back the asyncpg exception: it builds its OWN DBAPI-shaped `IntegrityError`,
copies only `sqlstate` onto it, and chains the real one as `__cause__`
(`dialects/postgresql/asyncpg.py::_handle_exception`). Observed here, asyncpg
0.30 / SQLAlchemy 2.0.51:

```
exc.orig                           -> sqlalchemy...asyncpg.IntegrityError
exc.orig.constraint_name           -> ABSENT
exc.orig.sqlstate                  -> '23505'
exc.orig.__cause__                 -> asyncpg.exceptions.UniqueViolationError
exc.orig.__cause__.constraint_name -> 'uq_sellers_tenant_code'
```

So `constraint` was `""` on every violation that has ever occurred, `"idem" in
""` was always False, and **the branch had never executed once**. The loser of a
concurrent same-key submit got a 500 instead of the winner's bill — a 500 is
`unavailable` to the sync engine, never `rejected`, so that bill retried forever
and dammed every bill behind it on that device. Hard rule 4 held sequentially and
failed under concurrency, on the money path, for four phases.

It surfaced by accident: the same idiom, copied into the new master-data writes,
turned a duplicate seller code into a 500 instead of a 409.

## Why it hid for so long

Three separate things had to line up, and all three are the normal case:

1. **The default made "I don't know" indistinguishable from "no".** `getattr`
   with a default cannot fail. An absent attribute and a genuinely empty
   constraint name produce the identical `""`, and only one of those is a fact.
2. **The happy path covered the visible case.** `create_bill` pre-checks the key
   with a SELECT, so a *sequential* replay returns 200 without ever raising.
   `prove_bills` CASE 2 tests exactly that and passes — it never reaches the
   handler. CASE 5 does race two submits, but with *different* keys, so it never
   collides.
3. **Nothing asserted the branch had run.** Every proof was green. A branch that
   is never entered cannot fail a test that never enters it.

## The rules

- **Never `getattr(foreign_object, name, default)` on a contract you have not
  observed.** Print the actual object, its type, and its `__cause__` chain once,
  from a real failure, and pin what you saw in a comment with the library
  versions. A wrapped exception is a different object from the one that was
  raised.
- **A missing attribute must not read as a negative answer.** Resolve to `""`
  only if every caller treats `""` as *"I do not know"* — never as *"there was no
  constraint"*. Encode that in the helper, not in each caller's head.
- **Prefer asking the authority over recognising the symptom.** The fix in
  `bills.py` was not to read the constraint name correctly — it was to stop
  needing it: on any `IntegrityError`, re-SELECT the idempotency key and return
  the bill if it now resolves. That is also *more* correct, because the bill's
  primary key is client-generated too, so a device retrying the same bill
  collides on `purchase_bills_pkey` OR on `uq_bills_tenant_idem` depending on
  which index Postgres checked first — not something a handler can predict.
  Where the name genuinely matters (`master.py` must know *which* entity's code
  was duplicated, and products carry two unique constraints), read it through one
  helper that documents the chain: `db.constraint_name_of`.
- **A safety branch with no proof that ENTERS it is not a safety branch.** If a
  handler exists for a race, the proof must actually run the race, with a start
  barrier and printed overlap evidence
  (`concurrency-tests-need-a-barrier.md`) — `prove_master_write` I1 prints
  `windows overlapped by 37.5 ms` and asserts the overlap is positive, because a
  green result from two sequential requests would prove nothing. Assert on the
  *outcome the branch produces* (statuses `[200, 201]`, exactly one bill), not on
  the absence of a crash.

## The generalisable shape

This is the sibling of `diagnosis-must-precede-the-fix.md`. That one is a
**failing** result pinned on the wrong cause. This one is a **passing** result
that proves nothing, because the code under test was unreachable. Both come from
the same move: believing a story about the system instead of observing it. When a
conditional guards something expensive to get wrong, the question is not "is the
condition right?" but **"have I ever seen this branch execute?"**

---

**SOURCE:** `a-differential-control-is-only-as-good-as-its-weaker-side.md`

# A differential control is only as good as its weaker side

**Applies to** every check of the form "these two outputs must DIFFER" or "these
two must AGREE" — a paired control, an A/B assertion, a before/after comparison.
If either side is a hardcoded literal, the relation is true by construction and
the control measures the literal.

## What was measured

`proveSignOut.ts` S9 ends with the control the whole case was built around: the
expired sheet and the offline sheet must differ, from an identical queue count
measured off a real `SqliteLocalStore`. Its own comment says why — *"A sentence
hardcoded into both branches ... cannot survive this line."*

R2b landed with the dead half's `session` derived from a real 401 pass and the
live half's left as the literal `"active"`. In that configuration the fold was
then broken so that a pass which said nothing about the caller — a plain outage,
`retryable` only — reported the session as ENDED. That is not a subtle defect:
it is an outage classified as a dead token, which is the exact wording defect
R2b existed to remove, pointed the other way.

**It ran fully green. Exit 0, zero failed cells.** Deriving the live half as
well, changing nothing else, turned the same mutation into **6 red cells** —
and the control was one of them.

| live half | broken fold | result |
|---|---|---|
| literal `"active"` | outage reported as expired | **exit 0, 0 failures** |
| derived from `liveRun` | same mutation | **exit 1, 6 failures, control fires** |

## Why the control went blind

It compares `deadText !== liveText`. With one side a literal, the literal keeps
the two texts apart no matter what the code under test does. The control cannot
fail, so its green carries no information — the mechanism
`a-check-that-never-went-red-was-never-observed.md` catalogues, wearing a face
that file does not list: not an empty needle, not an unreachable failing state,
not a break that stops the build, but **a comparison one of whose operands the
proof supplies itself.**

It is also the exact twin of
`a-checker-must-not-share-the-code-it-checks.md`, with the sign flipped. There,
a checker reading its expected value out of the thing under test made AGREEMENT
true by construction. Here, a checker supplying one side of a comparison makes
DIFFERENCE true by construction. Same defect, opposite relation — so the test is
neither "did I share code" nor "did I hardcode", but: **could this assertion have
come out the other way, given the inputs I supplied?**

## The prediction, and why it is recorded

The plan for this fix said the control "is the only cell that would notice" a
predicate that reported expired for everything. **That was wrong, and wrong in
the direction that costs most:** with only one half derived the control notices
*nothing*. The reasoning was sound and the conclusion was false, which is the
whole argument for running the disproof instead of arguing it — the null result
in the table above took one run and settled what an hour of reading could not.

## The rule

Derive BOTH sides of a difference from the real path, or the difference measures
the literal. A paired control does not inherit strength from the stronger half;
it is bounded by the weaker one. And when a proof measures one input off a real
run and hand-types another beside it, the hand-typed one is where the next
defect hides — the measured neighbour makes the whole cell look measured.

---

**SOURCE:** `a-docstring-that-states-a-filter-is-a-claim-about-its-caller.md`

# A docstring that states a FILTER is a claim about its CALLER, and nothing checks it

**Applies to** every comment that says what a value EXCLUDES, CONTAINS, is
ALREADY VALIDATED for, is SORTED by, or has had done to it before arrival — on a
function parameter, an interface field, a config key, a queue message. Those
sentences are not about the code they sit on. They are about code somewhere else
that the reader cannot see and no tool will compare them against.

**The rule:** a field's docstring may describe what the field MEANS. The moment
it describes what has been done to the value before it arrives, it has become an
unverified assertion about every call site, and it will outlive the one that made
it true.

## The instance

`mobile/src/sync/statusNotice.ts`, the field the status strip's whole sentence is
built from. At `4bde6e1` its documentation read, in full:

    /** Bills queued to send (pending + syncing). Excludes parked ones. */
    pending: number;

**The second sentence was untrue of every value the field ever received.**
`App.tsx` fed it `listByState('pending') + listByState('syncing')`, which carries
its own `sync_state = ?` predicate and excluded neither parked bills nor other
accounts'. So the operator read a count that included bills they did not own,
could not send, and could not clear by any action available to them — and the
sign-out refusal read the same number, so a device could refuse to be handed over
because of somebody else's work.

Corrected at `959f22d`, which is also the commit whose `git log -S` shows the
false sentence leaving the tree.

## Why every instrument in this repository is blind to it

This is the part that generalises, and it is uncomfortable:

- **Both typechecks passed.** `pending: number` was always a correct type. A
  comment carries no type.
- **Every proof was green**, including proofs that drove `statusNotice` directly.
  They passed the field whatever the sentence claimed, so the sentence could not
  make a cell move.
- **The diff was read** — more than once, across several passes that touched this
  file — and the sentence reads as *true* in isolation. It describes a sensible
  field. Nothing about it looks like a defect.
- **A control cannot reach it.** A positive control proves an instrument works on
  the inputs it contains; there is no instrument here at all, so there is nothing
  for a control to be about.

What finally found it was somebody reading the CALLER and the CALLEE in the same
pass, for an unrelated reason — the strip's numbers were being rewritten. That is
not a method. It is luck with a deadline.

## The discriminator

**Ask of any sentence in a docstring: could this become false without this file
changing?**

If yes, it is a claim about somebody else's code and nothing will tell you when
it turns. "Excludes parked ones" goes false the day a caller passes an unfiltered
number, in a commit that never opens this file — and there is no diff on which
the two appear together.

Contrast with a sentence that cannot rot that way: "the count the operator reads"
is about meaning, and only an edit here can falsify it.

## How to apply

1. **Do not state a filter in a docstring. Name the filtered value instead.** The
   repair here was not better wording — it was `UnsentBreakdown`, a type with four
   named fields, so "this person's, waiting on a connection" is carried by the
   NAME and the caller cannot supply the wrong thing without saying so.
2. **Where a precondition genuinely must be stated, make it a type or a check.**
   A branded string, a narrow interface, an assertion at the boundary — anything
   that fails when the claim does. A comment is the one form that cannot.
3. **When you do write one anyway, write it as an obligation and not a fact.**
   "CALLERS MUST pass the owner-filtered count" tells the next reader where to
   look; "Excludes parked ones" tells them the question is already settled.
4. **Keep the false version when you correct one.** It is the only evidence of
   how long it stood and of what it looked like while it was believed —
   `ARCHITECTURE.md § 13` and `PROJECT_STATUS.md` follow the same rule for the
   same reason. Silently replacing it leaves a file that has always been right.
5. **When a phase rewrites what a number MEANS, re-read every docstring on the
   path it travels.** This one survived four commits that changed the number's
   value and none that changed its description.

## Where this sits among the others

Sibling of [[a-warning-in-one-file-does-not-protect-the-next]], and the opposite
failure: there the note was TRUE and did not travel to the next site; here the
note travelled perfectly and was FALSE. Both are about prose that no instrument
reads, and neither is fixed by writing more of it.

Not [[a-green-cell-is-evidence-about-the-assertion-not-the-claim]]. Every
mechanism in that file is an ASSERTION that fires and measures something
adjacent to what you meant. This is not an assertion at all — nothing executes a
docstring, so there was never a cell to be green.

---

**SOURCE:** `a-gate-that-matches-a-keyword-misses-its-aliases.md`

# A gate that matches a keyword misses the engine's aliases for it

**Applies to** every guard, gate or refusal implemented by matching the NAME of a
thing — a SQL keyword, a statement, a command, a filename, a route — and hardest
where the gate exists because the consequence of missing one is not recoverable.

**The rule:** the authority on what a thing may be CALLED is the engine that
accepts the names, never the author of the pattern. Enumerate the target's
synonyms from the engine's own grammar before writing the pattern, and drive one
probe per synonym — a control over the spelling you thought of is precisely the
control that cannot see the spelling you did not.

## The instance

`server/scripts/prove_reconcile.py` runs destructive SQL against a restored copy
of the money database. Its gate 2 refuses any injection whose SQL touches a role,
because roles are CLUSTER-WIDE and the live database shares the cluster. The
pattern was:

    ROLE_SQL = re.compile(r"\b(alter|create|drop)\s+role\b", re.I)

PostgreSQL accepts `ALTER USER`, `CREATE USER` and `DROP USER` as documented
aliases of the ROLE forms, writing the same catalogue (`pg_authid`); and
`ALTER GROUP`, whose RENAME form is defined as `ALTER ROLE ... RENAME` and whose
ADD/DROP USER forms write role membership in `pg_auth_members`. All are
cluster-wide, which is the only property the gate cares about. **None of them
matched.**

Both patterns, run against the same five statements:

| statement | old pattern | new pattern |
| --- | --- | --- |
| `ALTER USER recycle_app BYPASSRLS` | **ADMITTED** | REFUSED |
| `CREATE USER recycle_probe LOGIN PASSWORD 'x'` | **ADMITTED** | REFUSED |
| `DROP USER recycle_probe` | **ADMITTED** | REFUSED |
| `ALTER GROUP recycle_app ADD USER recycle_owner` | **ADMITTED** | REFUSED |
| `ALTER ROLE recycle_app BYPASSRLS` | REFUSED | REFUSED |

**The admitted statement in row one is the sentence the gate's own docstring
names as the thing it exists to refuse.** That docstring reads: *"`ALTER ROLE
recycle_app BYPASSRLS` would be the natural way to prove check S4 — and roles are
CLUSTER-WIDE, so it would disable tenant isolation on the LIVE database sitting
in the same cluster. A proof that endangers production is not a proof … The gate
is mechanical (the SQL is scanned) rather than a promise to remember."*

So the gate refused the statement exactly as its docstring spells it, and admitted
the same statement in the other spelling. What the hole cost, had anyone written
that injection: tenant isolation disabled on real bills for as long as the
injection ran, and left disabled if the script died between apply and undo.

## Why no run could have found it

The gate **has** gone red, and always could. It refuses `ALTER ROLE` correctly,
and a positive control over `ALTER ROLE` passes for the right reason. Every
question this repo normally asks of an instrument answers reassuringly.

The failure is silent by construction, and the asymmetry is the point:

* a gate that **over**-refuses announces itself immediately — the refusal aborts
  the run, so a false positive is a non-start nobody can miss;
* a gate that **under**-refuses changes no output at all. No cell moves, no count
  moves, no exit code moves. There is nothing to notice.

It is found by reading the engine's grammar against the pattern, not by running
the suite. The disproof is one table: put the same inputs through the old pattern
and the new one, and require the old to ADMIT what the new refuses.

## Why it is not [[a-check-that-never-went-red-was-never-observed]]

That file's operative question is whether a check could **ever** have gone red.
Here it could, and did. Its mechanisms are all a check that cannot fire, fires
vacuously, or is looking at the wrong artifact — the instrument failing to reach
its subject. This instrument reaches its subject and answers correctly, on the
input the author thought of.

**A positive control proves the matcher WORKS. It says nothing about the
matcher's DOMAIN.** That is a different question and it needs a different
disproof, which is why this is its own file rather than a tenth mechanism there.

Not [[a-differential-control-is-only-as-good-as-its-weaker-side]] either: neither
operand here is a literal supplied by the test. Both spellings are real strings a
real engine really accepts.

And [[a-checker-must-not-share-the-code-it-checks]] already records this very gate
approvingly — *"the refusal enforced by a scan rather than a comment"* — which
was right, and stays right. A scan does beat a comment. A scan is only as good as
the set of strings it scans FOR, and that second half is what nobody checked.

## The gate whose self-test cannot live in the suite

`guard()` raises `SystemExit` on a match, so a probe injection carrying a role
statement **aborts the entire run** rather than reporting a pass. A gate whose
positive result kills the suite cannot be self-tested from inside it. The probe
here was therefore external and thrown away after it ran.

That has a consequence worth carrying rather than shrugging at: the alias list
has no cell, and a domain that exists only in the head of whoever last widened
the pattern is exactly the promise-to-remember the mechanical gate was written to
replace. **So the alias list is written at the pattern, in source, where the next
person editing that line must read it**, together with the instruction to re-run
the probe when the line changes. When the self-test cannot be a cell, the domain
must at least be a comment at the site — which is weaker, and is the best
available.

## How to apply

1. **Ask what else the engine calls this.** Before writing a pattern that matches
   a statement, command or keyword, read the grammar or the reference page for
   that statement and enumerate its documented aliases and equivalent forms.
2. **One probe per SYNONYM, in one run.** Not one control for the class. Four
   spellings need four refusals; a regex that catches one alias and misses another
   is this defect, and a single control cannot distinguish the two states.
3. **Measure the BEFORE.** Refusals under the new pattern prove nothing alone —
   they are consistent with a pattern that always refused. The evidence is the
   pair: ADMITTED under the old, REFUSED under the new, in one table.
4. **Keep the original capability in the same table.** `ALTER ROLE` refused by
   both patterns is the row that shows the widening did not trade one hole for
   another.
5. **Run the negative half and COUNT it.** Every input that must still pass, still
   passing, with the count measured in that run — 19 injections built, 19 through
   `guard()` — and never quoted from a plan or an earlier run.
6. **Know where the gate's failure aborts.** If a positive result kills the run,
   confirm the guard loop completes before any guarded action executes, so a false
   refusal is a non-start rather than a half-applied change; and write the domain
   at the pattern, because no cell can hold it.
7. **Ask it of the siblings.** Any other gate keyed on a surface form inherits the
   question. `.claude/hooks/pipe_gate.py` matches check scripts by FILENAME shape;
   whether a check reached by another surface form — a different path spelling, a
   `-m` invocation, a wrapper — still matches is **unmeasured here, and is the
   question rather than a finding.**

---

**SOURCE:** `a-grant-boundary-belongs-to-a-database-not-a-role.md`

# A grant boundary belongs to a DATABASE, not to a role

**Applies** whenever a containment property is written down as a property of a
role — "it cannot reach X", "it has no USAGE on Y", "it is excluded by default" —
and whenever a bootstrap script establishes that property with a `REVOKE`.

**The rule.** A `GRANT` or `REVOKE` on a schema is scoped to the database it was
executed in. A role is scoped to the CLUSTER. So a sentence of the form *"this
role cannot reach schema `public`"* is never true of the role; it is true of the
role **in the one database where somebody ran the REVOKE**. Write the database
into the sentence, or the sentence will be carried to a database where it is
false.

## What was measured, 2026-08-10, live cluster

`recycle_directory` is the reader role migration 0009 grants to. Three documents
state its containment as a property of the role:

- `server/db/init/00_init_roles.sql:38-41` — "Deliberately has **NO USAGE on
  schema public**, so it cannot see any tenant table even by accident."
- `server/migrations/versions/0009_directory_shop_codes.py:55-59` — "recycle_directory
  has NO USAGE on schema public [...] cannot reach tenants, users, purchase_bills or
  any other business table **BY ANY PATH**".
- `ARCHITECTURE.md:609-611` — "holding no `USAGE` on schema `public` — which can
  therefore reach the shop list **and nothing else**."

None of the three names a database. **The property was established by one
statement in one database:** `00_init_roles.sql:101` runs
`REVOKE ALL ON SCHEMA public FROM PUBLIC` — and it runs **after** `\connect recycle`
at `:95`. It never applied anywhere else.

Measured as the role itself, over every database it can connect to:

| database | `public` USAGE | read of `public.tenants` |
|---|---|---|
| `recycle` and the eight other `recycle*` | `f` | `ERROR: permission denied for schema public` |
| **`postgres`** | **`t`** | no relations exist to read |

`nspacl` on `postgres`'s `public` is the PostgreSQL 15+ default,
`{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}` — the `=U/` entry
IS the PUBLIC grant. Nothing revoked it there, because the script that revokes was
pointed at one database.

**The hole has nothing behind it today** — that schema holds 0 relations, and
`CREATE` is `f`, so no permanent object can be added to it. That is luck about
CONTENT, not a property of the boundary.

## Why it would cause a real bug

The next database created on this cluster starts with PUBLIC holding `USAGE` on
its `public` schema. If it is created by `CREATE DATABASE` from `template1` and
then given tenant tables — a staging copy, a second region, a per-customer
database, a scratch built by hand rather than by restore — **the role is inside
`public` there from the first second, and the three sentences above say it is
not.** The only thing that would stop it reading rows is the separate absence of
table grants, which is the belt the migration explicitly declined to rely on:
`0009:74-78` calls the schema boundary "the load-bearing half" and says the
containment "excludes by DEFAULT rather than by a REVOKE somebody has to remember
on every future table". In a database where the schema REVOKE never ran, that is
exactly the position you are in — remembering, per table, forever.

And the thing that makes it hard to notice: **the nine databases that DO have the
property agree with the documents perfectly.** The measurement that would catch it
is the one nobody runs, against the database nobody thinks of as part of the
system.

## The disproof, and it ran the other way first

The hypothesis going in was the opposite and stronger: that the SCRATCH databases
would be weak, because they are created by restore rather than by the bootstrap
script. **That was wrong** — all nine `recycle*` databases carry
`{recycle_owner=UC/recycle_owner,recycle_app=U/recycle_owner}`, byte-identical,
because `pg_dump` emits the schema's ACL and the restore replays it. The weak
database is the one that was never part of the application at all.

**A test aimed at the plausible failure found nothing; the same test widened to
every database the role can reach found it.** The widening cost one extra
`\c` per database.

## What to do

- **Put the database in the sentence.** "No `USAGE` on `public` **in `recycle`**"
  is the true claim and is barely longer.
- **Ask of any containment property: what statement established it, and what was
  that statement's scope?** Role attributes (`rolsuper`, `rolbypassrls`) are
  cluster-wide and travel. `GRANT`/`REVOKE` on schemas and relations do not.
  `ALTER ROLE ... SET` without `IN DATABASE` is cluster-wide — measured here:
  `pg_db_role_setting` holds one row for this role with `setdatabase = 0`, so its
  `search_path` DOES travel to all twelve databases while its containment does
  not. **Two settings on one role, opposite scopes, in the same `.sql` file.**
- **Prefer a migration to a bootstrap script for anything that must travel with
  the schema** (`revoke-in-migration.md` gives the same instruction for a
  different reason: a migration is applied per database, which is exactly the
  scope a schema REVOKE has).
- **Enumerate every database, not the one under discussion**, when testing a
  claim that names none.

Sibling of `a-round-trip-must-agree-on-its-key-space.md`: there, two sides of a
check disagreed about their DOMAIN. Here a claim and its evidence disagree about
their domain, and the claim's domain is the wider one.

---

**SOURCE:** `a-green-cell-is-evidence-about-the-assertion-not-the-claim.md`

# A green cell is evidence about the assertion, not about the claim

**Applies to** every assertion you are about to cite as having established
something — and hardest when the suite is green and the change felt small. A
cell tests exactly the sentence it contains. The CLAIM in your head is a
different object, and the gap between them gets filled by whatever else happened
to be true. FIVE mechanisms produced that gap in ONE phase (P1.7's ownership
work, `a471dc2`..`fde2b0c`), and they are five different mechanisms with one end.

Sibling of `a-check-that-never-went-red-was-never-observed.md`, separated by
where the failure sits: there the instrument is structurally incapable of
firing. Here it fires, correctly, about something adjacent to what you meant.

## 1. A difference-check is satisfied by a wrong non-null value

`proveOwner.ts:297` asserts the bill row read back with an identity signed in
DIFFERS from the same row read back with none. Under a deliberate mutation that
wrote the tenant into the user column — the row wrong in exactly the way the case
exists to catch — **that cell stayed green**, because a wrong non-null value
still differs from null.

What caught it is the cell beside it, `:305`, requiring the difference to run the
right way round: one side owned, the other unowned. Recorded in `0ac09ef`.

**Assert the DIRECTION of a difference, never its existence.**

## 2. A comparison of two literal-typed constants never runs at all

The same file's O4 needed a control that its two identities genuinely differ.
Written the obvious way it would not compile: `const` narrows each string to its
own literal type, so `TENANT_A !== TENANT_B` is a comparison between types with
no overlap and TypeScript rejects it as **TS2367**.

The dangerous repair is the natural one — delete the check, it is "obviously
true". That leaves the case with no defence against a fixture whose two
identities are the same value, which every other assertion in it would pass. The
four constants now carry `: string` annotations for no reason but this, and
`proveOwner.ts:70` says so, because an annotation that looks like noise gets
tidied away. Recorded in `0ac09ef`.

**A widening annotation can be load-bearing. Say why, at the constant.**

## 3. A downstream observable is kept correct by a second mechanism

`proveVoidOwner.ts:387` asserts that after another person signs in, A's void was
not handed back to the queue. `:374` asserts the same event on the ROW: A's
refusal survives B's sign-in.

The sign-in routine was then unfiltered on purpose. **The queue cell stayed
green** — `listVoidsToApply` still filters by requester, so the queue was right
even though the routine had written to a person who was not there. Only the row
cell went red. Recorded in `cfb6633`.

Two mechanisms guarded one observable, so a green there was evidence about
whichever still worked. **Assert on the state the code under test WRITES, not on
what a later reader returns.**

## 4. Reusing a shape carries its assumptions with it

The odd one out: caught by reading, not by a green — which is why it is worth
keeping, because it shows what the green would have been worth.

A permanently rejected void had to leave the void queue. A 403 already did
exactly that, via `void_refused_at`, and reusing it looked free. It is not the
same situation, and the source said so in two places: `clearVoidRefusals`
retracts refusals on every sign-in, so the infinite retry would have RESUMED each
shift — stopped every four seconds, restarted every morning, which is harder to
notice than never stopping; and `billNotice` routes that column through
`forbiddenReason`, whose text is about permission, so the card would have told
the operator their account may not cancel bills, on a bill the server still holds
as live money.

**The attempt-count proof would have passed either way.** The void does stop
being re-sent. `proveVoidTerminal.ts:288`'s V2 exists only because the hazard was
found by reading first. Recorded in `869977a`, and written out at the code in
`engine.ts:463`.

**Before reusing a mechanism, ask whether the SITUATION is the same — not whether
the code fits.** Then look at what already consumes the thing you are reusing.

## 5. A comparison whose fixture is empty holds by arithmetic

`proveDraftOwner.ts` C2 asserts that a draft refused to the wrong person keeps
its LINES — the sharpest half of "nothing was destroyed", because
`local_draft_lines.draft_id` is `REFERENCES local_draft(id) ON DELETE CASCADE`
with `foreign_keys` ON, so deleting the header takes the lines silently and
nothing else in the case would notice.

The fixture came from `newDraft()`, which builds a cart with **no lines**. So the
cell compared 0 with 0 and printed `its LINES survive too — 0 of 0`. **Green, and
incapable of anything else** — no mutation, no defect, no input could have moved
it, because the relation held by arithmetic rather than by the code under test.

Giving the fixture one real line turned the SAME cell red under a mutation that
deletes the refused row: `its LINES survive too — 0 of 1`. Recorded in
`fde2b0c`, and the fixture now carries its own guard at `proveDraftOwner.ts:241`
— `CONTROL: the draft HAS a line to lose — otherwise 'its lines survive' is 0 of
0` — because the next person to simplify that fixture would re-create this
exactly.

**Not mechanism 1 with different words.** There the value was wrong and non-null,
so the cell had two real operands and compared them badly. Here there are no
operands: both sides are empty, and the assertion is true of every universe.

Siblings in the other direction, and worth reading together:
[[a-check-that-never-went-red-was-never-observed]]'s ninth mechanism is the
needle fine and the HAYSTACK empty, and
[[a-control-must-contain-what-fooled-you]] is a control that omits a shape the
real input holds. This is neither — the control contains nothing at all on
EITHER side of the comparison.

**Count the fixture before trusting a relation over it.** A cell asserting that
a collection survived must first assert the collection was non-empty.

## The discriminator

When a cell is green and you are not certain it looked at anything, do not read
the cell. **Break the claim in the smallest way you can and check that THIS cell
moves** — not that the suite goes red, which any of its neighbours can do.

Four questions, in order, and each caught one of the above:

1. Could this have come out the other way, given the inputs I supplied?
   (Catches 1 and 2.)
2. What else, still working, would keep this observable correct if the thing I
   am testing were broken? (Catches 3.)
3. What does the code I am reusing already assume, and who else reads it?
   (Catches 4.)
4. How many things is this cell actually comparing? Print the count, not the
   verdict. (Catches 5 — and it is the cheapest of the four, because `0 of 0`
   and `1 of 1` are the same word until the numbers are on the screen.)

**WHAT TO LOOK AT FIRST when a cell is green and you are not sure it looked at
anything: the OPERANDS, printed, before the verdict.** Not the assertion, which
reads correctly in all five mechanisms above; not the suite, which any neighbour
can redden. Make the cell print what it compared — the two values, the two
counts, the two identities — and read those. Every one of the five was found the
moment its operands were visible: a wrong non-null value beside a null, two
constants the compiler had already resolved, a queue answered by a different
statement, a column reused from a situation with other assumptions, and a
comparison with nothing on either side.

## AMENDED 2026-08-18 (P-SELLERAUTHOR) — the discriminator has a hole: the mutation must be one the SCHEMA WILL STORE

"Break the claim in the smallest way you can and check that THIS cell moves"
assumes the break you chose can actually happen. **A constraint can refuse your
mutation, and then the red you get is about the constraint.**

Measured while adding `sellers.created_by` (migration 0011). The phase brief
named the disproof itself: write the principal's TENANT id into the column — a
wrong, non-null, plausible value — and require the differential cell to redden.
It reddened. **EIGHTEEN cells reddened**, and the two that matter read
`db=None`.

Because `fk_sellers_created_by (tenant_id, created_by) REFERENCES users
(tenant_id, id)` cannot resolve a tenant id to a user row. The INSERT raised
23503; the assign-branch retry loop re-raises anything that is not
`uq_sellers_tenant_code`, and `_raise_for_integrity` re-raises anything not in
`_DUPLICATE_CODE_CONSTRAINTS`; so `POST /sellers` answered 500 and **no row was
written at all**. There was never a wrong value in the column for the cell to
discriminate. A bare `created_by IS NOT NULL` check would have produced the
identical eighteen reds.

**AND THE BLAST RADIUS READS AS MORE EVIDENCE, WHICH IS THE TRAP.** Eighteen red
cells feel like a stronger disproof than one. They are the opposite: a wide red
is what a NEIGHBOUR does, and the discriminator above already says so about
greens. Nobody re-reads that sentence while watching a suite they meant to break
go satisfyingly red.

What DID test the cell was a wrong value the constraint ADMITS — the other
principal's real user id, FK-valid, non-null and entirely plausible. **Exactly
one cell moved**, and it printed the stored value:
`db=35d09981… staff=bef92d61… admin=35d09981…`. Its mirror — the staff id
hardcoded instead — moved exactly the other cell. Neither is reachable by a
one-sided assertion, which is why the cell asserts over TWO rows created by TWO
principals: **one constant is right for at most one of them**, so no single wrong
value can satisfy the pair.

**The rule: before running a disproof, ask whether the schema will ACCEPT what
you are about to write.** If a constraint refuses it, you have measured the
constraint — worth knowing, and not what you came for. Then pick a wrong value
the constraint admits, and require the red to be NARROW and to NAME the value it
found.

Two siblings, and they divide cleanly.
[[a-mutation-on-a-protected-write-path-needs-a-scratch-database]] is about WHERE
a mutation runs; this is about WHAT it writes, and the two are asked in that
order because a mutation that cannot be stored still leaves rows everywhere the
proof got to before it failed.
[[a-differential-control-is-only-as-good-as-its-weaker-side]] is why both
principals are read from `/whoami` rather than from seeddata: a differential
whose sides are literals measures the literals.

## The rule

An assertion is a sentence, and a green is evidence about that sentence and
nothing more. Name in the cell's own text WHICH claim it carries, and when two
cells can both go green for different reasons, keep both — the pair is the
evidence, not either half.

---

**SOURCE:** `a-label-is-a-reference-with-no-checker.md`

# A label is a reference, and nothing in this repository checks one

**Applies** the moment you APPEND to any numbered or lettered collection this
project uses as a label space — the D-numbers, `S1`–`S6`, the `P` steps, the closed
`A` and `R` logs — and to every sentence anywhere that names one of those labels
bare.

**A label looks like a citation and is not one.** `tools/verify_citations.ps1`
parses exactly one form, `` `FILE § Section` "handle" ``, and asserts the section
and the handle each resolve to one line in the named file. **A bare `D6` matches
nothing it looks for.** It carries no filename, so there is no target to resolve,
and the checker cannot report a label that resolves to two things any more than it
can report one that resolves to none. **The instrument is not weak here, it is
blind by construction** — and its green says so in neither direction.

## What happened

`ARCHITECTURE.md § 10` had carried its own `D1`–`D5` since 2026-08-10. Four
account-provisioning decisions were appended to it the same day as `D6`–`D9`.

`ROADMAP.md § The decisions the ordering forced` has carried a **different**
`D1`–`D12` since 2026-08-07, about ordering rather than architecture, of which
`D6`, `D7`, `D9` and `D11` are OPEN — the shared package's contents, the desktop
renderer's CORS origin, which stage owns Android, and how a desktop app is
installed. And one sentence names them bare:

    ROADMAP.md, P2.6
    **DONE WHEN:** D6, D7, D9 and D11 each carry an answer, or a recorded
    reason the pilot did not settle it.

**Three of those four labels now name two unrelated things**, and the sentence is a
DONE WHEN — the thing this project uses to decide a step is finished. A session
checking whether `D6` carries an answer, landing in the architecture file, finds a
fully-reasoned decision about creating users and can close a step about a shared
TypeScript package.

**THE CHECKER RAN TWICE, OVER BOTH FILES, AND REPORTED `BROKEN=0` BOTH TIMES**,
while the ambiguity was live in the tree it had just read. Every citation genuinely
did resolve. Nothing was wrong with the run; the class of defect was outside what
it can express.

## Why the obvious search would not have found it

The change was about passwords and account creation. The natural sweep — and the
one that was run first — greps the vocabulary of the change: `password`,
`create.user`, `provisioning`, `rate.?limit`. **The broken sentence contains none
of those words.** It contains four letters and four digits.

It was found by a search whose brief was the SHAPE OF THE CHANGE rather than its
subject: *what enumerates or counts the collection I am about to append to?* That
angle also turned up five other stale counts in the same pass, including `§9`'s
"D1 through D4" and `§12`'s "D1 and D3 remain wholly unbuilt", neither of which
mentions accounts either.

**The general form, and it is the reusable part:** *when you APPEND to a
collection, the sites you break are the ones that REFERENCE the collection, and a
reference need not contain one word of your subject.* Grep for the collection, not
for the change.

## What to do

- **Before minting a label, grep every other file for that exact label.** One
  command. `git grep -nE '\bD6\b' -- '*.md'` would have returned the DONE WHEN
  above before the append, not after.
  **BOUND, MEASURED 2026-08-20: that grep CANNOT SEE A COLLISION YOUR NEW LABEL
  CREATES IN SOMEBODY ELSE'S CITATION, because the label that breaks is not the
  one you are minting.** Minting `P1.20` into `ROADMAP.md` broke the section
  citation `` `ROADMAP.md § P1.2` `` at two sites — section names resolve by
  case-insensitive SUBSTRING over heading lines — while the prescribed grep for
  `P1.20` returned **nothing, exit 1, over every tracked markdown**. The remedy
  above is aimed at the label you are writing; this collision is created by a
  label you are not. Grep instead for every cited section name your new label
  CONTAINS, and see
  `lessons/README.md § Lessons` "a heading you ADD breaks a citation to a DIFFERENT heading nobody touched".
- **Never write a bare label across a file boundary.** Both files already knew to
  qualify when citing each other — `ARCHITECTURE.md` writes "`ROADMAP.md` D4" and
  `ROADMAP.md` writes `` `ARCHITECTURE.md § 10. The three settled decisions` `` D3
  — which is precisely what makes an UNqualified one readable as either.
- **Do not renumber to dodge the collision.** It orphans every existing reference,
  which is the same argument that closed the `A`-numbers and the `R`-numbers rather
  than tidying them. Record the collision in both spaces instead, which is what was
  done.
- **Know which of your instruments is blind to what.** Ask of any green: what class
  of defect could this run not have expressed? Here the answer was "any defect in a
  reference that is not a citation", and that covers every label in the project.

## Bounds

**The collision was PRE-EXISTING and this change doubled it, rather than creating
it.** `D1`–`D5` already meant different things in the two files before any of this,
and nobody had written that down. So the finding is not "an append introduced a
collision" but "a collision existed, was invisible, and appending is what made a
sentence turn on it".

**Not measured: whether the other label spaces already collide.** `S`, `P`, `A` and
`R` were not checked, and the same command would answer it. The claim here is about
`D` only.

**No instrument was built.** A checker for label spaces is a different change and
was not attempted, so this file is the only thing standing between the next append
and the same result — which is exactly the limit
`a-warning-in-one-file-does-not-protect-the-next.md` describes about itself.

Sibling of `a-check-that-never-went-red-was-never-observed.md`'s sixth mechanism,
separated by what the instrument can REACH: there the checker read the artifact and
not what pointed at it, and pointing it at every source fixed it. Here no source
list helps, because the pointer is not a citation and the checker has no concept of
it.

---

**SOURCE:** `a-lock-is-proven-by-what-waits-not-by-a-race.md`

# A lock is proven by what waits, not by a race

**Applies to** every cell claiming that code takes a lock, a mutex or any other
serialisation point — and to every cell claiming that taking it costs nothing.
Hardest over HTTP, where the only window a test can synchronise is the REQUEST
and the window the lock closes is a fragment of it.

**The rule, in one line:** do not race the lock, HOLD it — and then say WHICH
lock the thing that waited was actually waiting on.

## What happened

P1.8b added a per-tenant lock so that the two writers of the seller-code space —
the refill route and the create path — cannot derive the same candidate at the
same moment. Three cells were written to prove it. **All three were green with
the lock deleted from the route**, each for a different reason, and each reason
is one somebody would reach for again.

### Attempt 1 — a start barrier between two requests

Two refills, two threads, one `threading.Barrier`, overlap printed, exactly the
shape [[concurrency-tests-need-a-barrier]] prescribes. With `FOR UPDATE` deleted
from the route the cell reported `statuses=[200, 200]`, disjoint blocks,
`windows overlapped by 40.8 ms`, and **the whole suite exited 0**.

The overlap was real and the cell was honest. It is simply about the wrong
window. **A barrier synchronises the START of two requests; the section the lock
protects is a sub-millisecond SELECT sitting behind an auth round trip, JSON
parsing and a connection checkout.** Two requests overlapping for 40 ms says
nothing about whether their two critical sections landed in the same instant.

That is the gap in the earlier lesson, and it is worth naming: it says green
means nothing until you show the WORKERS overlapped, and it is right — but over
HTTP the overlap you can measure is between requests, and the overlap you need
is between the few microseconds inside them. **It happens intermittently and
therefore reddens intermittently.** Measured here: across five runs of the same
mutation the race collided ONCE, printing `statuses=[200, 500]`. A cell that
catches a defect one run in five is not a cell, it is a coin.

### Attempt 2 — hold the row, and time the route

The replacement looked airtight: the proof opens its own transaction, takes
`SELECT id FROM tenants FOR UPDATE`, holds it two seconds, and times one refill
against it. With the lock in the route it read **1796 ms**. With the lock
DELETED it read **1851 ms** — still green, still confident.

Nothing in the route was waiting for the route's lock, because there was not
one. **The INSERT was waiting, and it was waiting on the FOREIGN KEY.**
`seller_code_reservations.tenant_id` references `tenants (id)`, an INSERT's FK
check takes `FOR KEY SHARE` on the parent row, and `FOR UPDATE` conflicts with
`FOR KEY SHARE`. So the proof's own holder blocked the route whatever the route
did.

READ OUT OF POSTGRES, not inferred — `pg_stat_activity`, one second into the
hold, with the route's lock removed:

    pid=35461  state=active  wait=Lock/transactionid
      q=INSERT INTO seller_code_reservations (tenant_id, code, device_id, ...)

**AND THE FIRST ATTEMPT TO READ THAT COULD NOT SEE IT.** Connected as
`recycle_owner`, the same query returned

    pid=35338  state=None  wait=None/None  q=<insufficient privilege>

`pg_stat_activity` hides `state`, `query` and the wait event for a backend owned
by ANOTHER ROLE, and the application role is another role. The row was there and
said nothing, which reads exactly like "there is no server backend at all" — the
conclusion actually drawn for one round. **Read it as a superuser or you are
reading a redaction.**

### Attempt 3 — time an unrelated write while the refill is blocked

The obvious next cell: while the refill is stuck, does an ordinary write for the
same shop get through? It read 78 ms under `FOR UPDATE` and 70 ms under
`FOR NO KEY UPDATE` — green under both, so it discriminated nothing.

**A request WAITING for a lock is holding nothing.** The route's transaction had
not acquired anything yet, so the mode it would have taken could not possibly
affect a third party. The cell measured the proof's own holder.

## The measurement that settled it

A lock's whole content is what it blocks. So enumerate that, with a control:

| holder on the tenant row | INSERT of a child row (FK `KEY SHARE`) | the other writer's lock |
| --- | --- | --- |
| nobody | 4.6 ms | 2.7 / 4.1 ms |
| `FOR UPDATE` | **1506.0 ms BLOCKED** | 1508.8 ms BLOCKED |
| `FOR NO KEY UPDATE` | **3.2 ms free** | 1511.5 ms BLOCKED |

PostgreSQL 16.14, 1.5 s hold, 2026-08-24. The bottom row is what the design
wanted and nobody had written down: the two code writers wait for each other and
nothing else waits at all.

**THIS IS A DEFECT AND NOT ONLY A TEST PROBLEM.** `tenants.id` is referenced by
every tenant-scoped table in this schema. A per-tenant `FOR UPDATE` therefore
stalls every INSERT in the shop — a bill on the weighbridge included — for the
length of a refill, and a refill happens on every sync pass from every device.
Nothing errors; the yard just gets slower under exactly the load that matters.
**The next person who reaches for a per-tenant lock will write `FOR UPDATE`,
because that is the phrase everyone knows.**

## The cell that finally discriminates

Two holds, and the PAIR is the evidence:

1. Hold the row the way **the other writer** holds it → the route MUST wait.
2. Hold it the way **an ordinary in-flight write** holds it — a real uncommitted
   INSERT of any child row → the route must NOT wait.

Measured against the finished code, 2.0 s hold: nothing held **22 ms**, the
other writer's lock **1835 ms**, a bill being written **20 ms**. Deleting the
lock reddens cell 1 at 48 ms against 21 ms free. Changing the mode to
`FOR UPDATE` reddens cell 2 at 1880 ms — **exactly one cell, naming the number
it found**, which is what a disproof should look like
([[a-green-cell-is-evidence-about-the-assertion-not-the-claim]], its amendment).

## The rules

- **Do not race a lock; hold it.** A race asks the scheduler to reproduce a
  microsecond window and reports whatever it got. Holding the lock makes the
  wait deterministic, and the difference between waiting and not waiting is the
  entire content of the claim.
- **Say which lock the waiter was waiting on, from `pg_stat_activity`, as a
  superuser.** A duration is not a cause. `wait_event_type`/`wait_event` and the
  blocked statement name it; another role's backend will show you a redaction
  that looks like an absence.
- **Every lock cell needs its NEGATIVE half.** *It waits for the right thing* is
  half a claim; *and for nothing else* is the half that catches the mode, and it
  is the half that turns a lock from a correctness fix into a shop-wide stall.
- **A blocked request holds nothing**, so never measure collateral damage from
  inside one. Hold the collateral lock yourself and time the route.
- **When the parent row is referenced by foreign keys, `FOR UPDATE` is almost
  never the mode you mean.** `FOR NO KEY UPDATE` serialises writers against each
  other and leaves `FOR KEY SHARE` alone. Measure the pair before choosing; the
  conflict matrix is four lines of SQL and the wrong choice is invisible.
- **A cell that reddens intermittently is not a cell.** If a mutation has to be
  run five times to see one red, the green runs were not evidence either.

## Two of the probe's own defects, because they are the same class

The script written to MEASURE the conflict matrix was wrong twice before it was
right, and both are worth carrying:

- It read the FK's issuing user on a connection with no open transaction, where
  `set_config(..., true)` applies to that statement alone. The next statement ran
  with no tenant context, RLS returned nothing, the id came back NULL, and the
  INSERT died on `NOT NULL` **before it ever reached the foreign key the probe
  was about** — reporting `not blocked` truthfully about nothing
  ([[set-local-per-request]]; the constraint disarming the mutation is the shape
  the [[a-green-cell-is-evidence-about-the-assertion-not-the-claim]] amendment
  records).
- It shared ONE holder transaction across two timings and rolled it back twice.
  The second timing measured a lock nobody was holding and printed
  `not blocked`, which was true and meaningless.

**An instrument built to check a lock needs its own control**: a row measuring
the same operations with NOTHING held. Both defects are visible in one glance at
such a row and invisible without it.

## Where proven

`server/scripts/prove_seller_code_reservations.py` cell D5 — the two-hold pair —
and D5b, which is kept as a smoke test and carries in its own banner the
measurement that it stayed green against a route with no lock. The lock itself is
`server/app/master.py` `_lock_shop_for_code_assignment`, which holds the measured
table in its docstring so the mode cannot be "tidied" back to `FOR UPDATE` by
somebody who has not run it.

Related: [[concurrency-tests-need-a-barrier]] (the barrier this extends),
[[a-check-that-never-went-red-was-never-observed]] (an instrument that cannot
fire), [[a-proof-must-establish-what-it-is-talking-to]].

---

**SOURCE:** `a-migration-stack-is-a-log-not-a-schema.md`

# A migration stack is a log, not a schema

**Context.** 2026-08-18, re-deriving how many places encode the grade set A-D. A
paragraph already committed to `OPEN_ITEMS.md` named `purchase_bill_items.grade`
as one of those places and reasoned about its consequence: a HISTORICAL BILL
LINE, protected by hard rules 5 and 6, whose old rows "will carry grades a shop
may later stop defining". Every clause of it was false. That column does not
exist. `0001_initial_schema.py:253` created it and
`0003_move_grade_to_sellers.py:25` dropped it on upgrade, so the site was real
in the source text and dead in the database — and no third file records the
difference.

**Rule.** A migration stack is a LOG OF WHAT WAS DONE, not a description of what
IS. To state what the schema currently holds, read the HEAD STATE: query the
database (`pg_constraint`, `information_schema.columns`), or where that is not
available read the stack FORWARD to head with every DROP and ALTER applied — and
say which of the two you did, because they are not the same measurement. A grep
over `migrations/versions/` measures HISTORY, not state:
every hit is something that was true at one revision, and a later file may have undone it.

**Why (the failure it prevents), and the wrong number is the least of it.**
Because the drop happened, a bill line carries no grade at all — and hard rule 6
is why it never needed to. The line stores `unit_price` AND `list_price`
(`0001_initial_schema.py:257-258`), so a bill records the PRICE a grade
produced, never the grade itself, and a later change to the grade model cannot
reach a historical bill by construction. `0003` closed that deliberately: its
docstring says line items do not carry a grade and that per SRS 1.6 the grade
belongs to the SELLER. So the paragraph did not merely miscount. IT INVENTED A
RISK FOR A CASE THE SCHEMA HAD ALREADY DESIGNED AWAY, and filed it as an open
consequence for whoever plans the per-tenant grade model. A wrong fact costs a
correction; an invented risk costs whatever work somebody does about it, and
that work is indistinguishable from diligence while it is being done.

**Why nothing caught it, and none of the three are fixable by trying harder.**
The grep is a CORRECT instrument answering a NEIGHBOURING question, so it
returns a plausible integer, no error and no red — there is no failing state for
a control to be about. No proof can see it, because nothing executes a sentence
in a status file. And the fact was already written down ONE DIRECTORY AWAY:
`schema-audit.md`'s own "Where proven" paragraph states that `0003` drops the
column. It did not help, because that file's RULE points the other way — it is
about auditing a migration you are WRITING, against the agreed schema — so
nobody reading for a rule about counting live constraints would ever open it.
That is `a-warning-in-one-file-does-not-protect-the-next.md` with a lesson file
as the warning that failed to travel.

**How it got in.** The paragraph came from the advising session and was accepted
into a permanent file without the migrations being opened. CLAUDE.md's "A REPORT
IS A CLUE, NOT A SOURCE" already governs that promotion; what this records is
why a schema report is the easy one to wave through — it cites a filename and a
line number, and both are real. The citation resolves. Only the tense is wrong.

**Where proven.** Both figures re-derived 2026-08-18, each by its own command.
SOURCE TEXT encoding A-D: five — `product_prices.grade` and
`purchase_bill_items.grade` at `0001_initial_schema.py:169` and `:253`,
`ck_sellers_grade` at `0003:31`, `ck_tenants_default_grade` at `0010:52`, and
`Grade = Literal["A", "B", "C", "D"]` at `server/app/master.py:119`
(`git grep -n "IN ('A', 'B', 'C', 'D')" -- server/`, plus a search for the
`Literal`). CHECK constraints IN FORCE at head: three — the same list minus the
dropped column, minus the `Literal`, which is a Python type and not a database
constraint. THE GAP IS TWO AND ONLY ONE OF THEM IS THE DROP, which is the second
way the bare word "sites" misleads.

**BOUND, and it is the same weakness one level up.** The three-figure above was
itself derived by READING the stack forward, not by querying a database; no SQL
was run in the phase that wrote this. A careful forward read of a log is still a
read of the log. `pg_constraint` is the authority and it was not consulted, so
treat the three as the best available reading rather than as a measurement of
the database.

**Sibling of `schema-audit.md`, and the pairing is the point:** that one reads a
migration FORWARD, at commit time, against the spec, and catches a column that
should not land; this reads the stack BACKWARD, long afterwards, to learn
current state, and catches a column that no longer exists. Same artefact,
opposite directions, and neither rule implies the other. Also a sibling of
`a-docstring-that-states-a-filter-is-a-claim-about-its-caller.md` rather than of
the never-went-red family: there is no instrument to be vacuous and no cell to
be green, only a sentence that was true once and is not flagged when it turns.

---

**SOURCE:** `a-mutation-on-a-protected-write-path-needs-a-scratch-database.md`

# A mutation on a protected write path needs a scratch database

A mutation test proves an assertion can go red. To do that it has to run BROKEN
code against something. On a write path that hard rule 5 protects, that
"something" keeps every row the broken code writes, forever.

## What happened

`purchase_bills.created_by` was added in migration 0006, and `prove_bills.py`
CASE 1 and CASE 7 were written to assert it. Both assertions were then disproven
on purpose — the discipline [[a-check-that-never-went-red-was-never-observed]]
exists for, and the right thing to do. Two mutations of `create_bill`, each run
against the DEV database:

1. the column, its placeholder and `"cb": principal.user_id` removed from the
   INSERT. Five bills written with a NULL author (run `e903453d`).
2. a hardcoded seeded staff id written in place of the caller. Five bills
   written naming the wrong user (run `e63a1c76`).

Both went red as predicted, both were reverted, and the revert was proven
byte-exact by two hashes. The proof works. **Ten bills remain, and hard rule 5
means none of them can be removed.**

## Why this is worse than proof debris

The rows came through `POST /bills`. They are schema-valid, satisfy every
constraint including the composite FK, pass `reconcile.py`'s checks — which do
not look at `created_by` at all — and appear in the daily report as ordinary
trade. Nothing marks them.

That is what separates this from
[[a-proof-fixture-must-be-a-row-the-product-could-produce]]. That lesson is
about fixtures a proof writes DIRECTLY: rows the product could not have
produced, which is exactly what makes them findable — a checker can be taught
to catch a bill with no `doc_no`. These are the opposite. The product produced
them, through its real path, with its real validation. They carry a LIE rather
than an impossibility, and no check can see a lie in a column whose whole
purpose is to be believed.

Mutation 2's five rows name the staff user on bills an admin submitted. They are
indistinguishable BY INSPECTION from genuine staff-created bills — which is
precisely the harm `created_by` was added to prevent. The mutation that proved
the column works also wrote the first false attributions that column will ever
hold.

## The parallel was already in the repository

`scripts/prove_docno_clock.py` REFUSES to run against the live database, and
says why in its own `--help`: it lies to the server about the time, and against
unfixed code that mints a bill in a year which has not happened and opens a
counter row for it — neither of which hard rule 5 permits removing.

Same shape, written down before any of this. A clock lie and an authorship lie
are both mutations of production code on a write path whose rows are permanent.
The refusal `prove_docno_clock` carries is not specific to clocks; it is
specific to WRITES THAT CANNOT BE UNDONE. Nobody drew the parallel, and the
mutation was pointed at dev.

## The rule

Before mutating production code to make a proof go red, ask what the BROKEN code
writes, and whether hard rule 5 protects it. If it does, restore a scratch copy
and point the run at that. `prove_docno_clock.py --database` and
`prove_reconcile.py --from/--database` are both already this shape, and
`restore_db.py` makes the copy in one command.

**The test is not "is this the live database". Dev is not scratch.** It is the
database every proof, every report and every device pass reads, its rows are
protected by the same hard rule, and the only way it has ever shed a bill is
replacing the whole volume — which on 2026-08-03 also took the four real device
bills with it.

And a mutation that cannot be made scratch-safe should refuse WHERE IT RUNS, the
way `prove_docno_clock` does, rather than resting on whoever is at the keyboard
remembering. A reason enforced by a comment decays; one enforced by a refusal
does not — the same argument [[a-checker-must-not-share-the-code-it-checks]]
makes about its own ROLE-statement scan.

## Cost, measured

Ten permanent rows in the dev database across two runs — five authorless
(`e903453d`), five falsely attributed (`e63a1c76`) — identified by the run token
in their `idempotency_key`, which is the only thing that distinguishes them from
trade at all. That handle exists by luck, not by design: it is `prove_bills.py`'s
per-run idempotency key, and a mutation of any proof that does not scope its keys
per run would leave rows with no handle whatsoever.

---

**SOURCE:** `a-narrowing-type-is-not-a-barrier-to-the-object.md`

# A narrowing type stops the FIELD being named, not the OBJECT being passed

**Applies to** every type in this project whose omitted fields are described as a
safety property — "with no `id_number` on the type, nothing can leak one" — and
to every claim that a compiler is enforcing a data boundary.

**The rule:** a structural type with fewer fields refuses to let you *name* the
missing ones. It does not refuse to *carry* an object that has them. Those are
different guarantees, they are one word apart in English, and only the first is
the compiler's.

## What the claim was

`mobile/app/api.ts` declares `Seller` with five fields where the wire carries
nine, and says so deliberately, in its own header:

> FIVE FIELDS, AND THE WIRE NOW CARRIES NINE. THE OMISSION IS DELIBERATE. …
> a structural type describing a subset is a NARROWING, and here the narrowing is
> a SECURITY PROPERTY. With no `id_number` on the type, no screen can render one
> **and no code can hand one to `saveSellers` by accident** — the compiler's half
> of the guarantee that proveSellerCreate's C6 proves at the cache layer.

The first half is true. The second half is false, and it is the half that guards
the write.

## Measured, not argued

`tsc -p tsconfig.node.json --noEmit`, P1.8a phase 3, over a probe file holding
one line per way of moving a wide value into a narrow position.
`CreatedSeller` has all nine fields; `MasterSeller` has five.

| | the line | result |
|---|---|---|
| A | `const a: MasterSeller = created` | **compiles** |
| B | `const b: MasterSeller = { ...created }` | **compiles** |
| C | `saveSellers([created], "x")` | **compiles** |
| D | a literal naming `id_number` outright | refused — `TS2353` |
| E | `(a as MasterSeller & Record<string, unknown>)["id_number"]` | **compiles** |
| F | `a.id_number` | refused — `TS2339` |

Excess-property checking applies to **fresh object literals only**. A variable
(A), a spread (B) and an argument (C) are all ordinary assignability, and a wider
object is assignable to a narrower type — that is what structural typing *is*.

**The two refusals are the two nobody writes by accident.** D is somebody typing
the forbidden field's name into a literal, and F is somebody reading it back. The
three that compile are the three an ordinary author reaches for: take the thing
the server returned, put it in the list, hand the list to the store.

## What actually stops the leak, and it is not the type

`SqliteMasterStore.saveSellers` writes a fixed column list —
`(id, code, name, phone, grade, owner_tenant_id)` — into a table that has no
`id_number`, `address` or `vehicle_no` column at all, which is what
`proveSellerCreate`'s C6 measures at runtime and calls "the leak is
unrepresentable". **That guarantee is real and it is the whole of the guarantee.**
Between the server's response and that INSERT, a wide object can sit in React
state, be handed to any prop, and be serialised by anything that stringifies the
list.

So the ledger is:

- reaching **disk** with an ID card number — stopped, by the writer's column list;
- **rendering** one by name — stopped, by the type;
- **holding** one in memory and moving it around — not stopped by anything.

## Why nothing here would have caught it

There is no failing state to observe. Every typecheck passes, because the code is
type-correct; every proof passes, because the value never reaches the table the
proofs read. This is not [[a-check-that-never-went-red-was-never-observed]] — no
assertion is vacuous, and nothing was pointed at the wrong artefact. It is closer
to [[a-docstring-that-states-a-filter-is-a-claim-about-its-caller]]: a sentence in
a header, describing something outside the file, that nothing executes and no
instrument compares against the language's actual rules.

And it is the reason the second path is the dangerous one. C6 proves the
**refresh** path — the device is handed the server's list and writes it. Creating
a seller from the phone (P1.8a) opens a second door into the same list, and
[[two-green-proofs-do-not-cover-the-seam]] is exactly this shape: the proof that
owns the cache does not know a create exists.

## How to apply

1. **Never write "the type prevents X" about a value that is passed.** Write it
   about a field that is *named*. If the sentence is about an object crossing a
   boundary, the compiler is not the mechanism and something else must be.
2. **Convert at the boundary, field by field, and never by a spread.** The repair
   here is `pickableSeller(created: CreatedSeller): MasterSeller` in
   `mobile/src/master/sellerForm.ts`, which names all five and can carry nothing
   else. A spread would have compiled and would have carried everything.
3. **Put the conversion where a proof can reach it** — under `src/`, never under
   `app/` — and assert both halves in the same cell: that the five fields
   *survived* and that the three values are *absent*. An absence over a function
   that returned `{}` is true of everything ([[a-check-that-never-went-red-was-never-observed]],
   the ninth mechanism).
4. **When a new path starts producing a type you already narrow somewhere, go and
   read the narrowing's justification.** It was written about the path that
   existed then.
5. **Measure the claim before repeating it.** Six lines in a probe file and one
   `tsc` run separated the true half from the false half of a sentence that had
   been in the tree, believed, since P1.8a phase 1.

## Bounds, so this is not read as wider than it is

The over-claim in `app/api.ts` is **recorded and NOT corrected** — that file is
outside the phase that found this, and the correction is the owner's to schedule.
Nothing has been observed leaking: no code path in the tree today hands a
`CreatedSeller` to `saveSellers` or into `sellers` state, because
`pickableSeller` was written before one existed. What is measured is the
compiler's behaviour and the falseness of the sentence, not a defect in shipped
code.

---

**SOURCE:** `a-platform-can-refuse-an-effect-and-record-it-as-done.md`

# A platform can refuse an effect and record it as done

**Applies to** every effect your code asks a layer below it to perform and cannot
itself observe — a native presentation, a permission prompt, a notification, a
clipboard write, a file picker, a keystore entry, a background task registration.
And hardest when the symptom is *a control that does nothing*.

**The rule:** when an effect silently does not happen, ask whether the layer below
records **INTENT** or **OUTCOME** — and answer it by READING THAT LAYER'S SOURCE,
not by reasoning about what it probably does. If it stores intent, then "asked
for" and "happened" are the same bit, every reading above it agrees, and no
amount of care in your own state will ever disagree with the screen.

## The instance

`+ เพิ่มผู้ขาย`, the add-seller control inside the seller picker, did nothing on
first press. Consistently, on a real handset, observed by the owner on
2026-08-17. Pressing `ปิด` — which dismisses the picker — made the sheet appear.

**The state was right and the component rendered.** `App.tsx` set
`addSellerOpen` from the picker's own header, `AddSellerSheet` was mounted as a
sibling with `visible={addSellerOpen}`, and nothing in the app cleared it. Every
JavaScript-visible fact said the sheet was open. **The effect was dropped one
layer below anything a JavaScript reading can reach.**

## What the source says, and it is six lines

react-native **0.81.5**, `node_modules/react-native/React/Fabric/Mounting/ComponentViews/Modal/RCTModalHostViewComponentView.mm`:

```objc
107:  BOOL _shouldPresent;
108:  BOOL _isPresented;

151:  BOOL shouldBePresented = !_isPresented && _shouldPresent && self.window;
156:    _isPresented = YES;
157:    [self presentViewController:self.viewController
139:  [controller presentViewController:modalViewController animated:animated completion:completion];
```

At `:139` `controller` is `[self reactViewController]` — the app's root view
controller, **shared by every Modal in the tree**. There is no check for a
controller that is already presenting, and no queue across instances: each host
view knows only its own `_isPresented`.

**`_isPresented = YES` is set at `:156`, BEFORE the call at `:157`.** So a
presentation UIKit refuses is recorded as one that succeeded. And nothing
retries: `:203 didMoveToWindow` and `:209 didMoveToSuperview` both call
`ensurePresentedOnlyIfNeeded`, and `:151` gates it on `!_isPresented`, which is
now false for ever. `:282` `_shouldPresent = newProps.visible;` is the only other
input, and it is unchanged.

**A refused presentation is therefore indistinguishable from a successful one at
every layer JavaScript can read.** `onShow` does not fire, which is the one
available signal, and nothing in the app was listening for it — nor would a
listener have helped, because absence of an event is not an event.

## What it cost

**A device pass, spent on a state hypothesis**, because the only visible evidence
pointed at the app. That is the whole price of this lesson: the search was
conducted in the correct file, on correct code, and every reading of it came back
innocent — the same shape as `CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS
RUNNING" and its server-side twin, where the screen becomes evidence about source
that is not running.

## Why this is a file and not a note at the site

It is not about modals. It is about any SDK boundary where **the recording of an
operation happens on the near side of the operation**, which is an ordinary way
to write a wrapper: set the flag, then do the thing, because the flag is what
stops you doing it twice. That is correct when the call cannot fail and silent
when it can.

The generalisation is a question to ask of a wrapper, not a fact to remember:
**if this call were refused, what in this object would be different?** Here the
answer is *nothing*, and the answer was available in six lines of a file already
on disk.

## And what reading it BOUGHT, which is the part worth the file

The defect was located without reading any of this — the owner's observation that
`ปิด` reveals the sheet is already a disproof of a state bug, since state that
was never set would not produce a sheet later either. Reading the source did not
find the bug. **It decided the fix, and it eliminated the one that looks
cleverest.**

Three shapes were on the table: nest the inner sheet inside the outer one's
Modal; hold ONE `openSheet` state so two cannot be true; or one Modal host whose
CONTENT is selected by state. `:282` is what refutes the second — `_shouldPresent
= newProps.visible` is evaluated **per instance**, so two instances flipping in
one commit is still one dismissal and one presentation, and iOS is still being
asked to dismiss-then-present in a single turn. **A single state variable renames
that failure without removing it, and no headless proof can see the difference.**
The same six lines are what prove the third shape works: with one host
`_isPresented` stays YES and `_shouldPresent` does not change, so at `:151`
`shouldBePresented` is false and the dismiss branch's condition is false too —
neither fires, and only the children swap.

**Choosing between fixes is the thing source-reading is for.** All three shapes
are defensible from the symptom alone; only the source says which two leave the
mechanism in place.

## A second finding in the same file, which is why "it worked before" is not evidence

`node_modules/react-native/Libraries/Modal/Modal.js:280`:

```js
return this.props.visible === true || this.state.isRendered === true;
```

`isRendered` is set true on a false→true transition and cleared only by the
`modalDismissed` event or by unmount — and `:243` says in its own comment that
the event is *"for the old renderer in iOS only"*. Under the new renderer it
therefore never clears, so **on iOS a Modal's host view, once opened, stays
mounted for the rest of the app's life** while `:287-288` returns null for one
that has never been opened. Component state inside a closed sheet survives, which
looks like a feature and is a side effect of a latch. One real behaviour in this
app rested on it: `BillsPanel` kept a half-typed void reason across a close.

**Read the version you have.** All of the above is 0.81.5. Every line number here
will move, and the `modalDismissed` comment describes a renderer being removed —
if these citations do not resolve, that is the lesson working, not failing.

## How to apply

1. **Ask INTENT or OUTCOME of any effect you cannot observe**, and get the answer
   from the source. "It probably checks" is the assumption this lesson exists to
   remove.
2. **Prefer a fix that makes the refusable call happen once.** One presentation
   that stays up cannot be refused a second time. Two of anything sharing one
   parent is the shape to design out, not to sequence more carefully.
3. **Do not accept a fix whose proof cannot distinguish it from the defect.** If
   a headless test would be equally green before and after, the fix is a
   preference. Here that test names the second shape exactly.
4. **When the symptom is "nothing happened", the state layer is the wrong place
   to look second.** Look there once; when it is clean, go DOWN, not sideways.

Sibling of [[a-value-comparison-cannot-prove-a-path]] pointed at effects instead
of data — there a correct value proves nothing about the route it took, here a
correct state proves nothing about the effect it asked for. And the near miss
worth naming: this is NOT
[[a-check-that-never-went-red-was-never-observed]]. Nothing here is an
instrument, no assertion was vacuous, and there was no check to control. The flag
that lied is production code doing its ordinary job.

---

**SOURCE:** `a-proof-fixture-must-be-a-row-the-product-could-produce.md`

# A proof fixture must be a row the product could have produced

**Applies to** every proof, seed or test that writes business rows directly —
by SQL, by driver, by ORM — instead of through the code path a real client uses.

**The rule:** if `POST /bills` could not have produced the row, the row is not a
fixture. It is a hypothesis about a database.

## What happened

The first ever run of `server/scripts/reconcile.py` against the live dev
database reported **84 violations**. None of them were product defects. Both
causes were proof scripts writing rows the API cannot create:

| check | rows | written by | what makes it impossible |
|---|---|---|---|
| T5 — every persisted bill has a `doc_no` | 44 | `prove_rls.py:96` INSERTs a whole tenant graph directly, to exercise the RLS `WITH CHECK` on INSERT, and never calls `create_bill` | `create_bill` assigns `doc_no` in the SAME transaction as the insert. The column is nullable only for hard rule 3's offline state, which by definition never reaches the server |
| T7 — `doc_no`'s BE year is the year the bill arrived | 40 | `prove_daily_report.py` creates bills over HTTP, then backdates `server_received_at` onto a synthetic 2019 fixture day by direct UPDATE | the year and the stamp are now taken from ONE instant (see [[be-year-comes-after-the-timezone]]); nothing in the product can separate them |

Both scripts are otherwise good, and both had a real reason to write directly.
That is the point: **the mistake is not laziness, it is a reason that stopped at
the write and never asked what the row would look like afterwards.**

## Why this is worse than untidy test data

The pollution is the least of it.

1. **It pollutes, permanently.** Hard rule 5 forbids deleting a transaction, so
   these rows cannot be cleaned up. A checker that is red on its first run, for
   reasons unrelated to the product, is a checker with a short life —
   see [[queue-jam-must-be-visible]] for the general shape: a signal nobody can
   act on is a signal that gets switched off.

2. **A proof over an impossible row can be green while the real path is broken.**
   `prove_rls`'s bill has never once been through `create_bill` — not its doc_no
   assignment, not its idempotency check, not its master-data gate. Every
   assertion made about that bill is an assertion about seven INSERT statements
   the proof itself wrote. It proves RLS, which is what it set out to do; it
   proves nothing whatever about bills, and its ROW is nonetheless indistinguishable
   in the database from one that lost its number.

3. **It teaches the next reader the wrong lesson, in the dangerous direction.**
   The natural reading of a red T5 is "the invariant is too strict — bills are
   allowed a NULL doc_no, look, the column is nullable." Relaxing the check is
   one edit away, and after it the checker can no longer see a bill that really
   did lose its number. **Debris does not just add noise; it argues for its own
   legitimacy**, and the argument is persuasive because the rows are right there.

## The test to apply before writing a fixture directly

> Could the product, given some sequence of legitimate requests, have arrived at
> this exact row? Not "is it valid" — the schema will tell you that, and both of
> these rows are schema-valid. **Could the code have made it?**

If no, you have three honest ways out, in order of preference:

1. **Go through the real path** and then adjust only what the path cannot set.
   `prove_daily_report` already does the first half correctly — it creates over
   HTTP so `doc_no` and `list_price` come from the real code — and then breaks
   the second half by moving `server_received_at` somewhere the product could
   never have put it *relative to the doc_no it had already been given*.
2. **Write directly, but write the whole row**, including the columns the
   product would have filled. `prove_rls` needs a direct INSERT to exercise the
   RLS `WITH CHECK`; that requirement is about the INSERT, not about leaving
   `doc_no` empty. It could supply a `doc_no` and the matching `doc_no_counters`
   row and lose nothing.
3. **Make the fixture disposable and dispose of it.** `prove_rls` invents a
   THROWAWAY TENANT per run. Hard rule 5 protects a shop's ledger from a hard
   delete; it was never about a synthetic tenant a proof created eight seconds
   earlier. Deleting that tenant's whole graph on the way out costs nothing and
   leaves nothing. (46 tenants exist today, 44 of them one-bill husks.)

What is NOT on the list: teaching the checker to tolerate the row. That is
[[a-checker-must-not-share-the-code-it-checks]] in reverse — instead of the
checker borrowing the product's bug, the product's checker borrows the test's
bug.

## The general form

This is the write-side twin of [[proof-must-run-twice]]. That lesson asks
whether a proof's GREEN means anything. This one asks whether its FIXTURE does.
Both have the same root: **a proof is only evidence about the system to the
extent that what it touches is something the system could have touched.**

And the two compound. A fixture that is impossible AND undeletable is a
permanent false statement about the product, sitting in the one place — the
database — that every future instrument will read as ground truth.

---

**SOURCE:** `a-proof-must-establish-what-it-is-talking-to.md`

# A proof must establish WHAT IT IS TALKING TO before it asserts anything about the answers

**Applies** to every check that reaches something over a socket, a port, a
connection string, a queue or a path — and hardest to REFUSAL assertions, which
are the ones a wrong responder can satisfy for free.

**The rule.** Liveness is not identity. A 200 from `/health` proves *something*
is there; it does not prove it is the thing under test. Ask the responder to
identify itself — its own schema, its own version, its own build — and require
the answer to name the thing you are about to assert about. Identity first,
behaviour second.

## What happened, measured 2026-08-10

`prove_shop_code.py` started its own uvicorn on a hardcoded port 8137, polled
`/health` until 200, then asserted. On that port a uvicorn pair had been serving
this repository's API **since 2026-08-07**, running code that predated the
endpoint under test. The child could not bind and exited; the health poll was
answered by the OTHER server; and:

| assertion | outcome | why |
|---|---|---|
| P1 — a real code returns 200 with a tenant_id | **RED** | correct |
| P2 — an absent code is refused 404 | **GREEN** | the route did not exist |
| P3 — a malformed code is refused identically to P2 | **GREEN** | both were the same routing 404 |

**Two of the three refusal assertions passed against a route that did not
exist.** The only thing that failed was the positive assertion.

## The part that generalises, and it is uncomfortable

**The better the refusal was designed, the more satisfiable it became by
absence.** D4 required this endpoint to refuse identically whatever the cause, so
the refusal is deliberately generic and minimal: `404` with a one-key
`{"detail": ...}` body. **Starlette's default for an unrouted path is `404` with a
one-key `{"detail": "Not Found"}` body.** A well-designed generic refusal
CONVERGES on the framework's default refusal, so an assertion written to check
for it is satisfied by the endpoint's absence.

**Positive and negative assertions are not equally safe, and this is why.** You
cannot return the correct tenant_id by accident — P1 is self-validating, because
only the system under test can produce that value. A refusal carries no such
payload: *any* system can produce a 404. So a suite whose positive cells are its
weakest-looking and whose negative cells are its most careful will fail in
exactly the observed pattern — the careful cells green, the naive cell red.

## What to do

- **Ask for identity before asserting.** Here: fetch `/openapi.json` and require
  `/auth/shop-code` to be declared. A server that does not declare the path is
  not the server this proof is about, and the run stops before any cell is read.
- **Pin a refusal assertion to YOUR refusal, never to the status.** `404` is
  shared with the framework; `detail == "unknown shop code"` is not. Deleting the
  route now reddens P2 instead of greening it.
- **Do not hardcode a port.** Bind `:0`, read the port back, use that. A fixed
  port is a shared global on a developer's machine, and the collision is silent.
- **Watch the child, not just the clock.** If the process you started has exited,
  fail immediately and print its output. Waiting out a 45-second timeout and then
  blaming the timeout hides that the child died in the first second.
- **Ask what ELSE could answer this.** A database connection can reach a
  restored copy; a queue consumer can be a stale deployment; a file path can be a
  symlink to last week. The question is not "did I get a response" but "could
  anything other than the thing under test have produced this response".

## Where this sits

Sibling of `a-check-that-never-went-red-was-never-observed.md`, and specifically
of its FIFTH mechanism — there the instrument never read the artifact, here it
read a DIFFERENT ONE whose answers are shaped like the right ones. The
distinction is worth keeping: mechanism five is fixed by pointing the instrument
at the right file, and no in-run control catches it. This one IS catchable in the
run, by one request, and the fix is cheap enough that there is no excuse for
omitting it.

Also related to `a-differential-control-is-only-as-good-as-its-weaker-side.md`:
P3 compares two responses and requires them to be IDENTICAL. Two responses from
the wrong server are identical to each other, so that comparison held perfectly
while measuring nothing. A sameness assertion is only as good as the proof that
both sides came from the right place.

---

**SOURCE:** `a-quantified-sentence-names-no-member.md`

# A sentence that quantifies over a set names no member of it

**Applies** the moment you ADD to or REMOVE from any set this project also
quantifies over IN PROSE — a union or an enum, a registry, a label space, a
numbered list of mechanisms, a set of acceptance criteria.

**The rule.** The sentences that break are the ones that QUANTIFY — *every kind*,
*a non-bill kind*, *FIFTEEN MECHANISMS* — and they contain **neither the member's
name nor the set's name**. So the sweep every other lesson in this directory
prescribes, grep for the expression or grep for the label, runs CLEAN over a
document that already contradicts itself. **Sweep by the QUANTIFIER, never by the
member.**

---

## The instance — a member removed, and two criteria in the same commit that still stage it

`ROADMAP.md § P1.18` designs a device outbox carrying KINDS of work. Its design
subsection removes one of three declared kinds, with an argument and a decision
behind it:

    ROADMAP.md:2383   type OutboxKind = "bill_send" | "bill_void";
    ROADMAP.md:2398   **`seller_create` IS REMOVED FROM `OutboxKind` BY THIS DESIGN

and the same document's own *WHAT THIS SET DOES NOT COVER* repeats it at
`:3012` — "`OutboxKind` carries two members until it is answered."

**The two survivors both carry `LocalBill`.** So *a non-bill kind* has no instance
in the type at all. And the acceptance criteria stage one at THREE SITES, in TWO
criteria:

    2944   NON-BILL kind owed and nothing else, `signOut` returns `refused_pending`; against
    2949   the view maps): with only a non-bill kind owed, the text must NOT contain `ใบ` —
    2958   sweep. **Observable:** a non-bill kind's row is left in its in-flight state, the

All line numbers in this section are `git show 952c1cf:ROADMAP.md`, 3452 lines,
and the criteria block is 2832-3026 in that object. **Two criteria, three sites** —
`:2944` and `:2949` are parts (i) and (ii) of one criterion whose heading is at
`:2941`, and `:2958` belongs to the one at `:2956`.

**What each site cost.** The gate/sheet criterion could not be PERFORMED as
written: no staging of a two-member all-bill union produces "a non-bill kind owed
and nothing else". The `ใบ` clause was worse than unperformable — under the only
substitution available it turns a CORRECT sheet red, because a bill awaiting
cancellation is a bill and `ใบ` is its correct classifier; and the branch its own
named red case actually renders is the confirmation card, which contains no `ใบ`
anywhere, so the assertion was ALSO green over the broken build it was written to
catch. The boot criterion went vacuous: `bill_void`'s in-flight guard is an
in-memory `Set` on the engine, so a void is owed after a kill with or without any
recovery, and its control — "the identical staging with a BILL must still recover" —
passes on the sweep that already existed.

## Both ends are in ONE commit, which kills the "it went stale later" reading

    git log --oneline -S'IS REMOVED FROM' -- ROADMAP.md          -> a60340c
    git log --oneline -S'NON-BILL kind owed and nothing else' --  -> a60340c
    git log --oneline -S'in its in-flight state' --               -> a60340c

**The removal and the sentences it falsifies were authored in one commit, in one
file, 546 lines apart.** Nothing drifted, nothing was inherited from a stale
neighbour, and no second reader was needed to introduce the contradiction. The
vocabulary is older than the removal — *non-bill* was written while `seller_create`
was still a member — but the commit that removed the member is the commit that
shipped the sentences.

## What the standard sweep returns, measured, and its control

Corpus: the criteria block, `952c1cf:ROADMAP.md` 2832-3026. Tool `grep -oi` piped
to `wc -l`, counting OCCURRENCES and not matching lines, stated because the two
differ here.

| needle | occurrences | where |
|---|---|---|
| `seller_create` | **0** | — |
| `OutboxKind` | **4** | `:2848`, `:2850`, `:2852`, `:3012` — **none a staged site** |
| `non-bill` (the CONTROL) | **3** | `:2944`, `:2949`, `:2958` — exactly the three |

**The control is the whole point of the table.** The instrument works on this
corpus and finds these sites — by the QUANTIFIER. Grepping the member returns
nothing, and grepping the TYPE returns four hits of which three are a compile-time
probe in a different criterion and one is the sentence that is already correct. A
faithful sweep by either returns clean over a broken document.

**AND THE QUANTIFIER SWEEP IS CASE-SENSITIVE-FRAGILE HERE.** `grep -o "non-bill"`
without `-i` returns **2** and misses `:2944`, which reads `NON-BILL` in capitals —
this repository shouts its emphasis, so the same phrase appears in two cases within
one criterion. A sweep by the quantifier that forgets `-i` fails by finding LESS,
which is this repository's oldest failure shape.

## The second instance, same commit, pointing the other way — an ADDITION, and a count

`a60340c` also appended a mechanism to a lesson in this directory:

    lessons/a-check-that-never-went-red-was-never-observed.md:1197
      ## A SIXTEENTH MECHANISM (P1.18 stage 2, 2026-08-18) — ...

and did not touch `:10`, which reads, in that file's own words:

    **FIFTEEN MECHANISMS, and this line is the ONLY place in this file that says how
    many.** Every heading below names its own mechanism and never the running total,
    so appending another is a one-number edit, here.

`git show a60340c -- <that file> | grep -E "FIFTEEN|SIXTEEN"` returns exactly one
line, the added heading. **The one-number edit the file's own text demands was not
made**, and the file stood at sixteen mechanisms declaring fifteen until the phase
that wrote this lesson corrected it. Counted by heading: *The first four instances*
(4) + fifth through twelfth (8) + *A THIRTEENTH AND A FOURTEENTH* (2) + fifteenth +
sixteenth = **16**.

**That instance is an ADDITION, which is why this lesson is written over CHANGING
the membership of a set rather than over removing from one.** A rule phrased as
"removing a member is not finished until the criteria are swept" would not have
caught a count line.

## Why no existing lesson reaches it

### Not the be-year sweep — there is no expression, and the type name misses too

`be-year-comes-after-the-timezone.md`'s amendment is the nearest general form: "When
a lesson fixes a computation, the sweep is not done until every OTHER site of that
computation has been checked — tests included", and its instrument is "a repo-wide
grep for the *expression*, not for the symptom". Three things stop it. Its scope noun
is a COMPUTATION and nothing here was computed. Its instrument is an EXPRESSION and
there is none — measured above, the type name misses every broken site. And its
topology presumes an ELSEWHERE, production fixed and proofs missed eight months
apart; here both ends are one file, one section, one commit.

### Not `a-label-is-a-reference-with-no-checker` — its remedy needs the label to be IN the broken sentence

That lesson is the closest sibling and its general form is nearly this one: when you
append to a collection, the sites you break are the ones that REFERENCE the
collection. It does not cover this for three reasons. It is written about APPENDING
and a removal mints no label. Its remedy is "before minting a label, grep every other
file for that exact label", which REQUIRES the broken sentence to contain the label —
its own instance turns on a sentence containing four letters and four digits, and
here the broken sites contain neither the member nor the set. And its object is a
label SPACE, a reference space with no semantics and no checker by construction; this
is a TYPE with a compiler behind it whose broken sites are prose the compiler cannot
reach.

### Not `a-docstring-that-states-a-filter-is-a-claim-about-its-caller` — its discriminator CLEARS this case

Right family: prose no instrument reads. Wrong discriminator. That lesson asks
"could this sentence become false without this file changing?" and says a *yes* means
it is a claim about somebody else's code. The answer here is **no** — the falsifying
sentence is in the same file, the same section and the same commit — so the
discriminator gives a false all-clear on a document that already contradicts itself.

### Not the never-went-red family — UNSTAGEABLE is not VACUOUS

Every mechanism in `a-check-that-never-went-red-was-never-observed.md` concerns an
instrument that RAN and produced a reading carrying no information. Here the criterion
cannot be run at all: it demands a staging the type cannot produce. Nothing goes green
because nothing executes. The decisive corroboration is that the same criteria set
applies that lesson CORRECTLY three criteria further down — "A guard that fails by
finding LESS is this repository's oldest failure shape" — so its author had it loaded,
applied it, and it did not reach the defect higher up the page.

## How to apply

1. **When you add or remove a member of a set, sweep by the QUANTIFIER.** Grep for
   *every &lt;set&gt;*, for the COMPLEMENT noun the prose actually uses (*non-bill*,
   *other than*, *any kind that is not*), and for the count words. **Case-insensitively.**
2. **Ask of every surviving sentence: is there still an instance?** A criterion, an
   observable or a staging that quantifies over a member you just removed is not
   merely wrong, it is UNPERFORMABLE, and an unperformable criterion is the one nobody
   discovers is broken because nobody can run it.
3. **Where a set has a designated single count site, the change is not finished until
   that one number is edited.** A file that says "this line is the ONLY place that
   says how many" has told you exactly which line to open.
4. **Do it in the same commit as the membership change.** Both instances here were
   authored by somebody who knew the set had changed, in the commit that changed it.
   No later reader has the context that makes the contradiction visible.

## Bounds

- **The removal is documentation-only.** `mobile/src/sync/outbox.ts:59` still declares
  `"bill_send" | "bill_void" | "seller_create"`. The member is forbidden by the design
  and present in the tree; the criteria contradict the DESIGN, not the compiler.
- **A deliberate temporary member is NOT an instance and must not be swept.**
  `REGISTRY-IS-TOTAL-AND-CONSTRUCTED` adds a member to `OutboxKind` on purpose,
  observes the compile error, and removes it. Three of the four `OutboxKind` hits in
  the table above are that probe. A repair that treats them as defects is wrong.
- **No instrument was built.** `a-label-is-a-reference-with-no-checker` ends in the
  same place and says so; this file is the only thing standing between the next
  membership change and the same result. A quantifier is a phrase somebody chose, and
  no checker can enumerate the phrasings a future author will reach for.
- **The figures are pinned** to `952c1cf:ROADMAP.md` because that file was being
  rewritten while they were taken, which is also why no line number here names the
  working tree.

---

**SOURCE:** `a-refusal-hands-back-what-it-refused.md`

# A 422 is a MIRROR — the framework hands back the value it refused, and one of those values is a password

**Rule.** Before constraining a field at the edge, ask what the REFUSAL returns.
FastAPI's default validation handler serialises pydantic's `input`, so the value
that failed comes back to the caller inside the error body. That is harmless for
a product code and it is a credential disclosure for a password.

## Measured, not reasoned

`POST /users` (`server/app/users.py`) declares `min_length=8` on `password`, at
the edge, exactly as [[edge-must-reject-what-the-column-rounds]] prescribes and
exactly as `master.py` constrains its own fields. Sending a seven-character
password returns:

```
422 {"detail":[{"type":"string_too_short","loc":["body","password"],
     "msg":"String should have at least 8 characters",
     "input":"abc1234","ctx":{"min_length":8}}]}
```

`"input":"abc1234"` is the password. Nothing in the route put it there and no
line of this repository asked for it: it is what `RequestValidationError` carries
and what the default handler prints. The same run shows the same mechanism on a
different rule — an `extra_forbidden` refusal echoes the rejected field's value
too (`"input":"22222222-2222-..."`, a tenant id).

**The disclosure is to the caller who sent it**, which is why this is a hazard
rather than a breach: the admin already knows the password they just typed. What
travels further is the BODY. This project has already shipped a screen that
rendered a raw server error body verbatim, with a seller uuid in it, and the
lesson is [[correct-classification-can-still-render-as-an-error]]. A client that
does that with this body puts a colleague's new password on a screen at a
weighbridge.

## Why no assertion caught it, and this is the part that generalises

The create proof asserts, by name and on the raw bytes, that the SUCCESS body
carries no `password`, no `password_hash` and no `token_version`. All three cells
are green and all three are about the 201.

**Absence assertions get written on the success path. The disclosure was on the
refusal path.** A refusal is where a proof asserts a status and a `code`, because
that is what the contract says; the body of a refusal is the thing nobody reads
back. Every route in this API that constrains a field at the edge has a refusal
shaped by the framework rather than by this repository, and not one of them has
ever been asserted on for what it contains.

Related in mechanism and opposite in direction to
[[a-check-that-never-went-red-was-never-observed]]'s ninth: there an ABSENCE cell
passed over an empty haystack; here the absence cells were sharp, well-controlled
and pointed at the wrong response.

## The state this was left in

**Recorded, not fixed.** The route ships with the echo. Fixing it means a
`RequestValidationError` handler for the whole API that redacts `input` — a
change to every endpoint's refusal shape, which is not a thing to slip into the
commit that found it. The proof prints the echo as a labelled OBSERVATION rather
than a cell, because no contract in this repository says the body must not carry
it, and a cell asserting a decision nobody has taken is a cell that fails for
being right too early.

## How to apply

1. When you add a constraint to a field at the edge, send a value that VIOLATES
   it and read the whole refusal body. Not the status, not the `code` — the body.
2. Ask of that body: would I be willing to print this on a screen, or write it to
   a log? If the field is a credential, a token, or anything that identifies a
   person, the answer decides whether the constraint may live at the edge as
   declared or needs a validator that refuses without quoting.
3. **The next two password routes are the reason this file exists.**
   `ARCHITECTURE.md § 10. The three settled decisions` D6 is three routes and two
   of them take a password. Both will constrain it the same way, and both will
   echo it on the same path, unless this is remembered when they are written.
4. Where a proof asserts a body's contents, write the sibling assertion on the
   REFUSAL body in the same run. A response nobody read back is a response nobody
   knows the shape of.

**Where measured.** `server/scripts/prove_user_create.py` P6, against
`recycle_restore_scratch`, 2026-08-10 — printed as
`the 422 body ECHOES the rejected password: True`, and repeated in that run's
summary so an observation nobody reads cannot be how it stays.

## AMENDED (2026-08-10) — it is fixed, ONE COMMIT after this file was written

**"The state this was left in" above is history now, and it is kept rather than
edited because the ORDER is the part worth keeping.** The section said the route
ships with the echo and that fixing it means a handler for the whole API. That is
exactly what was then built: `server/app/main.py::validation_error_handler`,
registered against `RequestValidationError` on the app, removing pydantic's
`input` from every validation error this API emits.

**WHY IT COULD NOT WAIT FOR THE ROUTES THAT MADE IT URGENT.** The next phase is
D6's two password routes, and each carries TWO secrets in one request — the
password in use and its replacement. Fixing the echo at those routes would have
produced an API that is safe where somebody remembered and leaks where nobody
did, while `POST /users` went on leaking regardless. A defect whose fix is a
shared handler is fixed at the handler, before the callers that need it, or it
is fixed once per author for ever.

**ONE KEY, UNCONDITIONALLY — NOT A LIST OF SECRET-ISH FIELD NAMES.** `password`,
`new_password`, `pin`, `secret`, `token` is the author guessing at what a thing
may be CALLED ([[a-gate-that-matches-a-keyword-misses-its-aliases]]), and it
fails in the permissive direction: the field nobody thought of is the field that
leaks. Removing `input` from every error object means there is nothing to
classify, so a route written next year is covered by a decision taken today.
Measured on a NON-SECRET field in the same run, because a rule you cannot see
working on an ordinary field is a rule you have not tested.

**WHAT THE 422 STILL CARRIES, because the opposite mistake was available and is
worse:** `detail` is still a LIST, and each error keeps `type`, `loc`, `msg` and
`ctx` — which field, in what way, against what bound. A handler that made every
validation error uninformative would have traded one defect for a bigger one,
and the shape is load-bearing elsewhere: `prove_master_write.py` tells a pydantic
422 from this API's kind/code refusals by the fact that it carries a list and no
`kind`.

**THE RESIDUAL IS UNCHANGED AND NO HANDLER CAN REACH IT.** A custom validator
that interpolates the rejected value into its own message still echoes it through
`msg`, because that text is the author's and nothing can tell it from a
legitimate sentence. Every constraint in this API is declarative today, so no
such message exists. **Rule 2 of "How to apply" above therefore still stands
unchanged** — read the whole refusal body when you add a constraint — and rule 3
is what the handler discharged.

**Where measured.** `prove_user_create.py` P6/H4 asserts the password's absence
on the RAW BYTES with a presence sibling in the same response; H1-H3 show the
removal is API-wide, H3 on `POST /uoms`, a route with nothing to do with
passwords. 83 cells, 0 failures, twice in a row with no reseed. **De-registering
the handler turns exactly six cells red** — H4, two of H1's, two of H2's and one
of H3's — while every cell asserting that the error still NAMES the field and the
reason stays green. That pairing is the evidence: the informativeness cells are
pointed at informativeness, not at the handler's existence.

---

**SOURCE:** `a-report-is-many-reads-that-must-agree.md`

# A report is many reads; under READ COMMITTED they are many moments

**Rule.** When one response is assembled from more than one SELECT and the
reader will COMPARE those parts against each other, the whole response must come
from one snapshot: `tenant_connection(tid, isolation_level="REPEATABLE READ")`.
The default is READ COMMITTED, where **every statement takes a fresh snapshot**.

## The bug this prevents

`GET /reports/daily` runs five queries: a summary aggregate, an off-list
aggregate, the per-bill lines, and two void lists. Under READ COMMITTED a bill
that commits between statement 1 and statement 3 is counted by the total and
absent from the list printed underneath it.

The owner is holding cash. The screen says 47 bills, 128,400 baht, and lists 46
bills that add to 126,100. Nothing is corrupt, no query is wrong, and there is
no way to tell from the response which number to trust. On the one screen whose
entire job is reconciling, an unreconcilable answer is worse than an error.

It is also the least reproducible class of bug there is: it needs a write to land
inside a window a few milliseconds wide, so it will never appear in a proof and
will appear in a busy yard at closing time.

## Why REPEATABLE READ is free HERE, and the trap in generalising it

A **read-only** REPEATABLE READ transaction in Postgres cannot fail with a
serialization error. 40001 comes from writes detecting a concurrent update, and
this transaction performs none. So the snapshot costs nothing and adds no retry
path.

**Do not carry that sentence to a write path, and do not carry it to
SERIALIZABLE.** They are different guarantees:

| | read-only | with writes |
|---|---|---|
| REPEATABLE READ | cannot get 40001 | CAN get 40001 |
| SERIALIZABLE | **CAN get 40001** | CAN get 40001 |

SERIALIZABLE will abort a purely read-only transaction to protect someone else's
serializable write. Reaching for "the strongest isolation" on a report would
therefore introduce a failure mode that REPEATABLE READ does not have — and a
500 on a report path is `unavailable` to a client, with everything
[[unavailable-is-not-rejected]] says that costs.

## The mechanical part that is easy to get wrong

The isolation level can only be chosen **at transaction start**. It is applied
before `begin()`, not inside it:

```python
async with engine.connect() as conn:
    if isolation_level is not None:
        conn = await conn.execution_options(isolation_level=isolation_level)
    async with conn.begin():
        ...  # SET LOCAL app.tenant_id goes here, INSIDE the transaction
```

Setting it after the transaction has begun is silently ignored by some drivers —
the code reads as if it asked for a snapshot and does not have one. **Assert the
level rather than believing the parameter**: `SHOW transaction_isolation` must
answer `repeatable read`, and the SAME check against a default connection must
answer `read committed`. Without the second half the first proves only that a
string was returned, not that the option did anything.

## How to apply

1. More than one SELECT in one response, and the parts get compared? One
   snapshot. Ask whether a reader would notice the parts disagreeing — if yes,
   it is this rule.
2. Read-only: REPEATABLE READ. Never SERIALIZABLE for a report.
3. Prove the level is really in effect, in both directions.
4. This is orthogonal to WHICH rows the report selects. The day boundary is
   [[doc-no-is-arrival-order-not-event-time]] and
   [[render-in-shop-time-not-device-time]]; this lesson is only about the
   parts agreeing with each other.

**Where proven.** `server/scripts/prove_daily_report.py` section R asserts both
levels through the real `tenant_connection`. Section P is the reason it matters:
`limit=1` returns one line and the identical totals, because the money is
aggregated in SQL over the whole day and never derived from the returned page —
a truncated list can never produce a short total.

---

**SOURCE:** `a-round-trip-must-agree-on-its-key-space.md`

# A round trip must agree on its key space

**Applies to** every check that compares two enumerations of "the same" set —
a backup against its restore, a manifest against a catalogue, an expected list
against an observed one, a dump's tables against a database's. Hardest where
the two sides are built by different code reading different sources, which is
the ordinary case and the reason the agreement looks free.

**The rule:** the two sides must be proven to enumerate the same DOMAIN, and
the day a domain widens is a SCHEMA change, not a data change. Ask of any
two-sided check: **what would make one side's key space grow without the
other's?** Whatever the answer is, that is the change that turns the check
into a liar, and it will arrive long before anybody uses the feature that
brought it.

## The instance

`server/scripts/backup_db.py` keys its manifest off whatever `pg_dump` wrote,
stripping only a `public.` prefix:

    if current.startswith("public."):
        current = current[len("public."):]

`server/scripts/restore_db.py` builds the other side from schema `public`
alone — `where n.nspname = 'public' and c.relkind = 'r'` — and then compares
over the UNION of the two key sets:

    for t in sorted(set(expected) | set(counts)):

For eight migrations the two sides agreed, and agreed by accident: every
relation in this database lived in `public`. Migration 0009 created
`directory.shop_codes`, the first relation outside it, and the comparison
broke in the same minute.

Measured on a throwaway fixture restored from the 0008 dump and walked up the
real upgrade path (`recycle_tw20260809_0009fixture`, 2026-08-09):

| dump | COPY headers | manifest key | `restore_db.py` |
| --- | --- | --- | --- |
| at 0008 | 12 | — | `RESTORE_EXIT=0` |
| at 0009, table EMPTY | 13 | `"directory.shop_codes": 0` | **exit 1** |
| at 0009, one row | 13 | `"directory.shop_codes": 1` | **exit 1** |

The red, verbatim, with every other one of the twelve tables `[OK]`:

    [FAIL] directory.shop_codes     dump=0  restored=None

    RESTORE FAILED: row counts differ from the dump for ['directory.shop_codes']

A number on the expected side, and nothing at all on the counts side. That is
the signature of a key-space disagreement rather than a lost row, and it is
worth learning to read: a row that failed to land shows a number on BOTH
sides.

## The trigger is migration-time, and everyone guessed first-use

`OPEN_ITEMS.md` recorded the open question in its own words — *"One inference
not measured: whether `pg_dump` emits a `COPY` block for an EMPTY table. If it
does, this fires on the first backup after 0009 is applied; if not, on the
first backup after the first code is issued."*

**It does, and the measurement went the worse way.** `pg_dump` writes

    COPY directory.shop_codes (tenant_id, code) FROM stdin;

for a table holding zero rows, followed immediately by its `\.` terminator. So
the manifest gains the unstripped key, and the restore fails, **on the first
backup taken after the migration is applied** — before any endpoint reads the
relation, before any client sends a code, before the feature exists as a code
path at all. The window everyone had in mind, between "migration applied" and
"first row written", is not a window. It is zero wide.

That is the part of this file worth carrying. The inference was reasonable,
was written down honestly as an inference, and was wrong in the direction that
costs more. **Cheap measurements that resolve a recorded inference should be
taken when the inference is written, not when it bites** — this one cost one
restore of a dump that already existed and two backups.

## One defect, two observables, DIFFERENT triggers

The same asymmetry produces a second symptom, and it does not arrive at the
same time. `backup_db.py` sums row counts across every schema while itemising
only `public`, so the summary total stops equalling its own itemisation — but
only once a row exists, because a zero-row table adds zero:

* at 0009 with the table empty: summary `844 rows`, itemisation 844. **They
  agree.** Nothing looks wrong.
* at 0009 with one code issued: summary `845 rows` over an itemisation of 844,
  and `MANIFEST.txt` reads `Rows      : 845 across 12 tables` above a list in
  which `shop_codes` appears **zero times**. `restore_db.py` prints the same
  inflated total back: `rows in dump   : 845`.

So one defect fires two observables with two different triggers, and **the
earlier one is the one nobody predicted**. Anyone who set out to reproduce
this by issuing a code would have seen both at once and concluded the data was
the trigger. The empty-table case is what separates them, and it only exists
as evidence because the fixture was dumped BEFORE the first row was written.

Where a defect has more than one symptom, stage the reproduction so the
symptoms can arrive separately. Two symptoms observed together are evidence
about neither's trigger.

## A red drawn over a good restore is worse than a missing check

The restore this failed was correct. Read back out of the target afterwards:

    recycle_restore_scratch|0009|1|0|1

— schema `directory` present, the table present, `alembic_version` `0009`, and
every one of the twelve public tables `[OK]` with `dump == restored`. Every
row landed. The checker called it broken anyway.

That is worse than having no check, and for a reason that has nothing to do
with this defect's size. `restore_db.py` is run in exactly two situations:
idly, to verify a backup harmlessly, and at 07:00 with a dead disk. A checker
that reds on a good restore teaches an operator that its red means nothing —
and the lesson is learned during the idle runs, then applied during the other
one. The instrument that would catch a genuinely empty backup
([[a-backup-is-a-claim-until-it-is-restored]]) is the same instrument being
taught to be ignored.

**A false red is not the safe direction. It is the slow way to arrive at no
check at all.**

## Why a positive control could not have found this

Both sides work. `copy_block_counts` correctly counts the rows `pg_dump`
wrote; the restore-side query correctly counts the rows in `public`. Point a
control at either and it passes for the right reason. The counter used to
measure all of this was itself controlled — `grep -c "^COPY "` against a
hand-built six-line file whose correct answer is 3, returning 3, proving
simultaneously that the pattern is anchored to line start and that blank lines
are not being dropped ([[a-check-that-never-went-red-was-never-observed]]).
Every instrument in the chain was sound.

This is the sibling shape of
[[a-gate-that-matches-a-keyword-misses-its-aliases]], one level up. There, a
control proved the matcher WORKS and said nothing about its DOMAIN. Here, two
controls each prove their own side works, and neither can say anything about
whether the two sides share a domain — because a control lives inside one side
and the defect lives BETWEEN them. It is found by reading the two enumerations
against each other, or by walking a fixture through the schema change that
widens one of them. Not by running the suite.

## How to apply

1. **Name both key spaces out loud, in the same sentence.** "The manifest is
   keyed by whatever `pg_dump` emitted, minus a `public.` prefix; the restore
   is keyed by relations in `public`." Written down side by side, the
   disagreement is visible without running anything. It is invisible while the
   two definitions live 200 lines and one file apart.
2. **Ask what widens one side and not the other.** A new schema. A partition.
   A view. A relkind nobody filtered on — `directory` holds THREE `pg_class`
   rows, the table plus two indexes at relkind `i`, so a predicate widened to
   "outside `public`" without a relkind filter gets a different wrong answer in
   the other direction.
3. **Fix it by making both sides use ONE key convention**, both qualified or
   both stripped — not by adding the new name to an exclusion list. An
   exclusion list entry reads as coverage and changes no result when the
   enumeration never produced the name in the first place.
4. **Treat a UNION comparison as a domain assertion.** `set(a) | set(b)` says
   "these two sets have the same members and I will report any that do not."
   That is a strong claim, usually made accidentally. If it is not what you
   mean, intersect deliberately and say what you dropped.
5. **Distinguish a key-space failure from a data failure in the OUTPUT.** A
   number opposite a `None` is not the same event as two numbers that differ,
   and an operator reading a red at 07:00 needs to know which one they have
   before deciding whether to trust the restore.
6. **Resolve a recorded inference while it is cheap.** An entry that says "not
   measured, and it fires either way" has already paid for the thinking; the
   measurement is what is left, and its cost only rises.
7. **Keep the negative control in the same lineage.** The 0008 backup and
   restore of the same fixture, same two scripts, one migration earlier,
   `RESTORE_EXIT=0` — that is what makes the red at 0009 evidence about the
   migration rather than about the fixture, the box, or the tools.

---

**SOURCE:** `a-rule-outside-the-repo-cannot-be-seen-to-drift.md`

# A rule outside the repo cannot be seen to drift

**Found 2026-08-16, during the documentation restructure, at `1d58899`.**

The advising chat's pre-send checklist had lived only in a pasted opening
prompt since its creation. The repository held ONE of its nine items — the
ninth, the negative-claim search rule — and recorded the blindness in its own
words: "that checklist lives in the advising chat's own instructions and NOT
in this repository ... nothing here enforces it, and nothing here can even
see it."

The finding arrived by the one route available: the owner supplied the other
eight items from memory, and instead of writing them in, this session
MEASURED them against the tree. The comparison surfaced what nothing inside
the repo could have: **the two roles had been running different rule-sets for
the project's whole life.**

The specifics, measured at `1d58899`:

- The advisor's checklist and the coder's rules (`CLAUDE.md` Workflow plus
  `START_HERE.md`'s done-checklist) overlapped in only FOUR concepts:
  counting names its tool, every negative carries a control, no
  self-contradiction, no measurement carried as fact.
- The coder's write-the-commit-message-to-a-file rule was never in the
  advisor's set. The advisor's control-on-every-negative was never stated
  generally in `CLAUDE.md` — searched with `control`, `names its tool`,
  `name the tool`, `second, independent`: only instrument-specific remedies
  existed (the count-it-must-meet rule, the second-independent-measurement
  rule, the SOURCES= read), each earned separately, the general rule never
  written once.
- No instrument could have fired. Drift detection needs a second copy to
  disagree with, and the repo held none: the rule was not merely unchecked,
  its drift was INVISIBLE by construction.

What closed it: the four shared checks now live inline in BOTH `CLAUDE.md`
and `ADVISOR.md` — duplication licensed by `tools/verify_shared_checks.py`,
which goes red the moment the copies differ, with `CLAUDE.md` declared
canonical (a third file both roles must open goes measurably unopened, so
the must-run items do not sit behind a pointer). The advisor-only items live
in `ADVISOR.md` and nowhere else, and the checklist travels with the paste
set instead of the prompt.

The rule to keep: treat any rule cited from conversation or memory as a
CLUE, and grep the tree for it before writing it anywhere. Where it is not
found, the finding is not "the rule is missing" — it is "this rule cannot be
seen to drift", which is worse, because a missing rule announces itself the
day it is needed and an unseeable one diverges quietly for the project's
whole life. The trigger to watch for is any rule a role is said to follow
that a grep cannot find.

**AMENDED 2026-08-17 — A SECOND MECHANISM, AND THE QUIETER ONE: THE RULE WAS
DELIVERED IN TWO PARTS AND ONLY ONE PART LOADS.**

The case above is a rule WHOLLY ABSENT from the tree, found by measuring a
from-memory copy against it. This one was neither absent nor drifted. An
auto-memory file for this project path arrives in two pieces: an index line
that loads unconditionally into every session for that path, and a body that
loads only when something opens it. The SCOPE was written in the body and the
INSTRUCTION in the index, so what actually reached every session was "Reply in
Thai, prompts in English" with NO ROLE ATTACHED — and a scope-less instruction
reads as universal.

**No comparison could have found it, which is what makes it a second
mechanism rather than a second instance.** The lesson above is about having no
second copy to disagree with. Here there is one copy, it is correct, and read
whole it says exactly the right thing: the scope sentence is in it. Nothing
had drifted and nothing was missing. The rule arrived with its scope stripped
by the DELIVERY, and the only artefact that could show it is the pair of
what-loads and what-does-not, which no diff and no grep compares.

Measured: this lesson was written 2026-08-16 at `1d58899`, about the advising
checklist. It was reproduced on 2026-08-17 — within ONE DAY, by a different
mechanism, in a file OUTSIDE this repository, where this lesson's own remedy
(grep the tree) cannot reach it.

**THE LIMIT, and it is a different claim from the mechanism.** On 2026-08-17 a
CLI coding session reported to the owner in Thai. Whether it read that index
line is UNCONFIRMED: the competing explanation is that it simply mirrored the
language it was addressed in, and no observation separating the two was taken
before the memory was corrected. The MECHANISM is measured — the index line
did carry an unscoped instruction, and the memory file records its own
correction in its own words. The CAUSATION is not measured. Do not let the
second borrow the first's standing.

The rule to keep: **PUT THE SCOPE IN THE LINE THAT LOADS.** The reader never
sees the line that does not. Wherever a rule is delivered in a part that
always loads and a part that does not, every word the always-loaded part omits
was, for every practical purpose, never written — so the scope belongs beside
the instruction, not underneath it.

---

**SOURCE:** `a-stored-future-instant-is-a-promise-about-a-clock.md`

# A stored future instant is a promise about a clock you do not control

**Rule.** A stored instant is a claim made by a clock we do not own. When it
falls **outside the window the code that wrote it could possibly have
produced**, it is not information about the data — it is evidence that the
clock moved between the write and the read. Believe the bound, not the stamp.

Applies to anything that schedules future work from a device clock, and to
every elapsed duration derived from a stored device timestamp.

## What happened

A bill bounced while the phone's clock was ~14h fast, so `markPendingAgain`
stamped `next_attempt_at` ~14h in the future. Legitimate at the moment it was
written. Then the clock was corrected **backwards**, and that stamp became a
schedule 14 hours out.

The send queue is strict head-of-line — only the oldest pending bill may go,
nothing may overtake — so `runOnce()` hit this at the head and stopped:

```ts
if (new Date(bill.next_attempt_at).getTime() > this.clock.now().getTime()) break;
```

One row held the entire queue shut for fourteen hours while the server was
reachable and answering every request. Moving the clock forward again released
it and it synced green.

And the screen said **ยังส่งเข้าระบบไม่ได้ตอนนี้ ระบบจะส่งให้เองเมื่อเชื่อมต่อได้** — the
same class of lie as [[401-is-about-the-caller-not-the-bill]], through a door
nobody was watching. The mechanism is worth writing down because it is not
obvious: a pass that attempts nothing returns at `r.attempted === 0` before
anything touches `online`, so the strip keeps whatever it last said. **A state
that is never recomputed is not "unknown", it is stale — and it reads as a
confident claim.**

## Two windows, one rule

The audit found the same rule needed against two different bounds, and they
look like opposite tests until you state the bound:

| | what it stamps | largest gap the writer can produce | suspect when |
|---|---|---|---|
| `master_cache.fetched_at` | something that ALREADY happened | **zero** (+ tolerance) | stamp is in the future |
| `next_attempt_at` | something SCHEDULED | `max(backoffMaxMs, masterDataRetryMs)` | stamp is beyond the horizon |

Both catch the *same backwards move*, from opposite sides. That is why they are
one module (`mobile/src/time/clockSanity.ts`) and not two ideas — a rule written
twice is two behaviours waiting to drift, the same reasoning as one formatter in
[[render-in-shop-time-not-device-time]].

**The horizon is what makes detection possible at all.** Backoff has a maximum,
so a `next_attempt_at` further out than that maximum cannot be a schedule. On the
device the stamp was 14h out against a 5-minute maximum — 168×. Not a judgement
call.

## The reaction is NOT shared, and must not be

This is the part that would be wrong if it were tidied up later:

- **`master/freshness.ts` fails CLOSED.** A suspect clock withdraws the price
  default, because a price defaulted from data of unknowable age is paid out in
  cash ([[cached-master-data-is-a-price-claim]]).
- **The send queue fails OPEN.** A suspect schedule is treated as **due now**,
  because the harm there is a bill that never leaves the device — real money
  already paid, on one phone, with no server record. An early send costs nothing:
  same `idempotency_key`, so the server answers a repeat with the existing bill
  (hard rule 4).
  The other half of this — that no one can look inside that phone to check — is
  `ARCHITECTURE.md § 11`.

Same rule, opposite responses. Folding them into one *decision* would be the
mistake; folding the *question* into one module is what stops them drifting.

## Read time, never write time

The stamp was **correct when written**. It only became evidence when the clock
moved afterwards. A write-time clamp cannot see that and would have fixed
nothing — this is the whole reason the check lives in the reader.

## Capping the number does not disarm the trigger

Found by the proof before it shipped, and it is the sharpest thing here.

`poisonedForMs = now - first_server_error_at` gates the red "ติดต่อฝ่ายสนับสนุน"
alarm. A **forward** jump made it 14h, so one bounce produced:

```
บิล 1 ใบส่งไม่ผ่าน 1 ครั้งติด นาน 840 นาที ทั้งที่เชื่อมต่อเซิร์ฟเวอร์ได้ — ... ต้องติดต่อฝ่ายสนับสนุน
```

A forward jump is **not detectable from one stamp** — "stored 14h ago" and
"genuinely 14h old" are the same past instant. What bounds it is not a clock but
the **work that must have happened during it**: N consecutive refusals can only
account for N attempt cycles. Beyond that the device was not watching (clock
jump, or the app was simply closed overnight), and the extra time is not
evidence.

The first fix capped the reported duration at `attempts × MAX_ATTEMPT_CYCLE_MS`.
That stops the absurd number and **does not stop the alarm**: at a 60s cycle,
merely *two* refusals account for 120s, which clears the 90s threshold on its
own — so the red alarm would still have fired at two refusals instead of five,
undercutting `POISON_ALARM_ATTEMPTS` by exactly the cry-wolf failure
[[queue-jam-must-be-visible]] exists to prevent. A quieter wolf is still a wolf.

**Two questions, two answers, off the same pair:**

```ts
poisonedForMs   // what the operator is TOLD.     Capped, so never absurd.
poisonObserved  // whether it is EVIDENCE.        False once the raw span
                // exceeds what the refusals account for. Only this may arm
                // the clock trigger.
```

A "worst case" and a "sanity check" computed off one expression is the identical
shape to the `Math.min`/`Math.max` bug in [[cached-master-data-is-a-price-claim]].
It will keep reappearing; it is worth recognising on sight.

Note what carried the alarm through all of this: **the COUNT trigger, which does
not read a clock at all.** That is why a genuinely poisoned bill still goes red
when the clock is unreliable, and it is the strongest argument for having had two
triggers in the first place.

## A refusal can be right while the sentence is absurd

The freshness gate withdrawing the price default under a forward jump is
**correct** — it fails closed. But it then told the operator that data fetched
two minutes ago was *"เก่าเกิน 12 ชั่วโมง"*.

Since the jump is undetectable, the fix is not to the decision but to the
**claim**. Separate the halves and say which is which:

- `asOf` is a **stored stamp** — true whatever the clock has done since. It leads.
- the age is **derived** from the device clock — so it is attributed
  (`ตามเวลาในเครื่อง`), never asserted as a fact about the data.

A banner that is occasionally absurd is a banner staff stop reading, and the
fetch time printed beside the age is what lets someone see for themselves that
the age is nonsense. Same family as never rendering a diagnostic
([[correct-classification-can-still-render-as-an-error]]): the audience decides
what the artifact may claim.

## A negative age is not a fresh bill

`pricingProvenanceLine` computed `age = device_created_at - master_as_of` and
returned null for `age <= JUST_FETCHED_WINDOW_MS` (then `FRESH_MAX_AGE_MS`). A backwards jump between opening the
cart and saving makes that difference **negative**, which sails through the same
test — so the stale-pricing marker **vanished on exactly the bill most likely to
have been priced from a cache of unknowable age**. A false negative on a money
marker, which is the direction that hides things (Rule 4,
[[cached-master-data-is-a-price-claim]]).

`master_as_of <= device_created_at` holds by construction, so the largest gap in
the other direction is zero. It fails closed: the line is shown and states the
fetch time instead of an age it cannot compute.

Also fixed alongside it, and wrong independently of any clock: `App.tsx` passed
the **minute-rounded** UI ticker as the bill's `device_created_at` on the confirm
dialog. Rounding *down* understates the age by up to 59s and, near the threshold,
suppresses the line entirely — on the last screen before cash leaves the drawer.
**A value rounded for display is not a timestamp.**

## What this deliberately does NOT solve

- **A forward jump collapses backoff.** Every stored `next_attempt_at` becomes
  due, and nothing can distinguish that from time genuinely passing without a
  monotonic reference that survives a restart — there is none (`performance.now()`
  resets; `Date.now()` is the thing under suspicion). The proof therefore claims
  only that backoff holds **with the clock stable**, and enumerates 904
  (schedule, instant) pairs showing the old and new gates agree inside the
  horizon. Retrying early is the safe direction anyway.
- **The deferred alternative, named and not built:** store `backoff_ms` beside
  the stamp and anchor it to a **server-supplied instant** (`server_received_at`
  is already returned), making the schedule a duration from a clock we do control
  rather than an instant from one we do not. That is a schema change plus a wire
  change. Owner's call; it was weighed and declined for this phase.
- **`ORDER BY device_created_at`** — a backwards jump makes a later-weighed bill
  sort earlier and take the lower `doc_no`. **No horizon reaches this**: every
  value is a plausible past instant. Already covered by
  [[doc-no-is-arrival-order-not-event-time]] (reports key on
  `server_received_at`); explicitly out of scope, on the record.
- `blockedForMs` has **no upper bound** and that is stated at the call site
  rather than skipped: an offline device legitimately accumulates days of elapsed
  time with no attempts to account for it, so capping it by attempts would
  understate a genuine outage. It is amber context and triggers nothing.

## How to apply

1. Every stored instant read against `now` gets a bound: **what is the largest
   gap the writer could have produced?** If the answer is "there isn't one", write
   that down at the call site (`Number.POSITIVE_INFINITY` is an explicit
   parameter in `credibleElapsedMs` for exactly this reason — the question must be
   answered, not skipped).
2. Check at **read** time. A write-time clamp cannot see a jump that happens
   afterwards.
3. Decide the **reaction** per call site — closed where money is paid, open where
   work would be stranded — and never let one helper decide it for both.
4. For a duration, ask what **work** accounts for it, and keep "what we report"
   apart from "what we treat as evidence". Capping a number does not disarm a
   trigger that reads it.
5. Put the rule where **every** reader sees it. `listReadyToSend` is dead in
   production but live in five proof cases; a rule that landed only in the engine
   would have left the suite green while asserting the pre-fix semantics. Both
   stores — real and fake — or the suite proves two different behaviours.
6. Return `null`, not `0`, for an unknowable duration. A clamped `0` is a number,
   and a caller will compare it to a threshold without noticing.

**Where proven.** `mobile/src/proof/proveClock.ts` — K1 clock stable (backoff
intact, 904 pairs), K2 back 14h (head sendable, whole queue drains in weighing
order), K3 forward 14h (no false alarm, no absurd count, plus the two-refusal
hole the proof itself found), K4 backwards mid-cart (marker survives), K5 the
banner's wording. **Every case carries its disproof**: the same inputs through
the pre-fix expression, asserted to produce the bad outcome — so green means
something failed before and does not now ([[proof-must-run-twice]]).

A guard in `SyncEngine`'s constructor **throws** if `backoffMaxMs` or
`masterDataRetryMs` ever exceeds `SEND_SCHEDULE_HORIZON_MS`, so the engine can
never write schedules its own reader would discard as clock damage. A comment
would have been forgotten; a throw fires on every path that builds an engine,
proofs included.

---

**SOURCE:** `a-value-comparison-cannot-prove-a-path.md`

# A value comparison cannot prove a PATH

**Applies** to every test whose claim is that data FLOWED from one place to
another — a response feeding the next request, a column reaching a screen, a
config value arriving at a driver, an id carried across a queue. The claim is
about a route. Every assertion you are about to write is about a value.

**The rule.** If the value at the end is correct, no comparison of values can
tell you it travelled. A correct hardcode and a genuinely carried value are the
same bytes, and equality cannot see the difference between them. To assert a
path you need PROVENANCE, which is a property of the object rather than of its
contents.

## What was measured, 2026-08-10

`prove_shop_code.py` claims a chain: `POST /auth/shop-code` returns a tenant
identifier, and THAT identifier is used to log in. The proof asserted it three
ways — the login succeeded, a token came back, and `GET /whoami` reported the
same tenant the resolve had returned.

The chain was then broken on purpose: the login was rewired to a hardcoded
literal instead of the resolve's response. **Every assertion still passed and the
run exited 0**, including the `/whoami` cross-check, which is the one that looks
like it closes the loop.

It could not have failed. The literal was the right uuid, so:

| assertion | with the chain | with a correct hardcode |
|---|---|---|
| login returns 200 | pass | pass |
| a token comes back | pass | pass |
| `/whoami` reports the resolved tenant | pass | **pass** |

## Why the obvious fixes do not work

- **"Compare against what A1 returned."** That is the `/whoami` check. It passed.
- **"Derive both sides instead of hardcoding one."** Both sides WERE derived from
  live responses — this is exactly the remedy
  `a-differential-control-is-only-as-good-as-its-weaker-side.md` prescribes, and
  it is not sufficient here, because the defect is not a literal on one side of a
  comparison. It is that the comparison is about values at all.
- **"Supply an input that could fail."** There is none. Any input that changes
  the expected tenant changes it on BOTH sides at once, because the server
  answers from the same fixture.

## What does work

**Carry provenance in the TYPE, and assert the type.**

```python
class ResolvedTenant(str):        # a str subclass: the wire is unchanged
    __slots__ = ()

resolved = ResolvedTenant(r1.json()["tenant_id"])   # only A1 constructs it
body = {"tenant_id": resolved, ...}
check(isinstance(body["tenant_id"], ResolvedTenant))
```

A literal is a plain `str` and fails before a request is sent. With the break in
place and this check present, exactly one cell reddened.

**ASSERT ON THE OBJECT THAT IS ACTUALLY USED, NOT ON THE ONE YOU PARSED.** The
first version checked the parsed variable, which stays correctly typed while a
hardcoded literal sits in the request beside it — green against the exact break
it existed to catch. The gate belongs on the value at the point of USE.

## The limit, which must travel with the technique

This proves the value FLOWED through this process. It does not stop an author who
writes `ResolvedTenant("1111-...")` by hand. It catches the accidental break and
the lazy one — which is what a regression looks like — and is not a defence
against a deliberate forgery. Anyone citing it for more than that is overclaiming.

## Where this sits

Extension of `a-differential-control-is-only-as-good-as-its-weaker-side.md`, not
a restatement: that one says a comparison is worthless when one side is a
literal, and prescribes deriving both. Here both sides were derived and the
comparison was still worthless, because **derivation makes a value trustworthy
and still says nothing about the ROUTE it took.** Related to the second mechanism
of `a-check-that-never-went-red-was-never-observed.md` — the failing state
unreachable from the inputs supplied — with the sharper case that here no input
exists that could reach it.

Ask, of any test that claims a chain: **what would this run do differently if I
pasted the expected value in by hand?** If the answer is "nothing", it is not
testing a chain.

## AMENDED (2026-08-10) — the same rule where the claim is an EFFECT, and a reason it hides that no input can reach

**The rule above is written about a ROUTE and it is not only about routes.** The
general form is: **the claim is about a BEHAVIOUR, and the assertion you are about
to write is about a VALUE that the behaviour happens to move.** A path is one
instance. Here is another, and it is the one that will recur, because it is the
shape every session-revocation check takes.

**What was measured.** `cb11f6a` added `POST /users/me/password`, which writes the
new hash and bumps `token_version` in ONE statement. `prove_user_create.py`
asserts two things beside each other:

| cell | what it reads | what it can support |
|---|---|---|
| S1's DELTA | the `token_version` in the 200 body, against the version in the token the server had minted | **the column moved** |
| S2 | the pre-change token re-issued at two endpoints, and refused 401 `token_revoked` | **the session died** |

Removing the bump reddened both, five cells in total. **That joint redness is
evidence about the STATEMENT, not about which cell carries the claim.** The delta
would be satisfied by any code that incremented the number — including code whose
guard never compares it, or a route that bumped a different user's row and
reported this one's. It is a shape check standing next to the claim, and it reads
exactly like the claim.

**WHY NO MUTATION CAN SEPARATE THEM HERE, which is the new part.** In the original
case above, an input existed that would have exposed the difference and the proof
simply did not supply it. Here **one statement moves both facts**, so every
mutation that touches the bump moves the proxy and the behaviour together, and no
input, fixture or control inside that proof can tell you which cell you are
relying on. The separation is not discoverable by running the thing — it is
discoverable only by asking what each cell would still detect if the two were
split.

**Nothing shipped wrong, and that is the point.** Both cells were present, so the
route is correct and proven. What the disproof exposed is a failure that has not
happened yet, and **this is the path it will take** — not an illustration of one:

> The next session writes a route that must end a session. It looks for how the
> last one was proven, finds `S1`'s delta, and copies **"assert the version
> moved"** because that is the cell whose claim is easiest to state. It sees the
> token re-issue below it and drops that as redundant — the version moved, so of
> course the session died. **It ships a route whose sessions never die, and a
> proof that is green about it**, and the green is truthful: the number really
> did move.

Nobody has to be careless for that to happen. The delta reads like the claim, it
reddens when the claim breaks in the one case anyone tries, and it is shorter.
**The only thing standing between that path and the tree is the cell labelling
itself**, which is why the labelling is a rule below and not a nicety.

**How to apply.**

1. When two cells would redden from one cause, name which one carries the claim
   and say so **in the cell's own text**, so a reader cannot cite the other.
   S1's delta is labelled a shape check; S2 says it is the cell the disproof
   targets.
2. Ask of any assertion on a number: **if this number moved and the behaviour did
   not, would this cell still pass?** For a version counter read out of a response
   the answer is yes, always.
3. Assert the behaviour by ATTEMPTING it — re-issue the credential and require the
   refusal — and on more than one endpoint, so the refusal is a property of the
   session rather than of one route.
4. A status is not a code. The refusal here must name `token_revoked`, because a
   401 also arrives from a locked account and from a malformed token, and an
   outcome two mechanisms produce is evidence about neither
   (`a-check-that-never-went-red-was-never-observed.md`, seventh mechanism).

**Where recorded.** `PROJECT_STATUS.md § Current phase`, under the disproof, with
the sentence that matters carried in full: nobody should cite the delta as
evidence a session died.

---

**SOURCE:** `a-warning-in-one-file-does-not-protect-the-next.md`

# A warning written in one file does not protect the file beside it

**Applies to** every hazard this repository has already paid for and written down
at the site where it bit — a comment at the line, a note in a docstring, an
entry in a module header. Those notes are worth keeping. This is about what they
do NOT do.

**The rule:** a warning defends the line it sits on. It does not defend the next
file, the next author, or the same author an hour later, because nobody reads a
file they are not editing. **What defends the second site is an acceptance
criterion that the mistake would fail.** If the hazard can only be caught by
somebody remembering, it will be paid for again, and the interval can be shorter
than a single session.

## The instance

`backup_db.py` carries this at its superuser check, in its own words:

> `rolsuper::text` renders 'true'/'false' (psql only shows t/f for an uncast
> boolean) — comparing against 't' here silently failed every check once.

A precise, dated, correctly-sited warning about a real trap on this box: casting
a boolean to `text` in a psql query yields `true`/`false`, not `t`/`f`.

In the same repository, in the same session, `restore_db.py` grew a new presence
probe that asked the database which relations existed:

    select 'product_prices', (to_regclass('"public"."product_prices"') is not null)::text

and compared the answer with `r[1] == "t"`.

**All thirteen keys reported `MISSING` against a database that held every one of
them.** Every relation was there. The restore was perfect. The check said nothing
had arrived.

The warning was one directory entry away, in the file this script is a sibling of,
about the identical construct, and it did not help — because writing
`restore_db.py` does not involve reading `backup_db.py`, and there is no moment in
that work at which a person would go looking.

## What actually caught it, and it was not a person

The acceptance criterion for the change was written before the change, and it was
not "exit 0". It was:

> the two 0009 dumps: exit 0, **and `directory.shop_codes` PRESENT as an OK row
> with a number on both sides**. A green that reaches exit 0 by not asking about
> that key is the wrong fix and looks like the right one.

That criterion fails the bug instantly and loudly: thirteen `[FAIL] … restored=MISSING`
rows and exit 1. **An exit-code criterion would not have.** The bug's natural
failure direction here happened to be red, but the same mistake pointed the other
way — a comparison that treats every key as absent and has no keys to check —
reaches exit 0 by asking nothing, which is exactly the shape
[[a-check-that-never-went-red-was-never-observed]] catalogues and exactly what the
"number on both sides" clause was written to forbid.

**The defence generalises past this bug.** "Exit 0" is satisfied by a check that
did the work and by a check that skipped it. "This named row is present, and both
sides of it are numbers" can only be satisfied by a check that asked the question
and got an answer.

## Why this is not just "write more tests"

The claim is narrower and it is about WHERE the knowledge has to live. This repo
already does the right thing at the first site: the hazard is recorded at the line
that suffered it, which is what
[[a-gate-that-matches-a-keyword-misses-its-aliases]] concluded when it put an
alias list at a pattern that no test cell could hold. That remains correct. What
this file adds is that a note at the site is a floor and not a ceiling: **the
second site needs its own mechanism, and the cheapest mechanism is an acceptance
criterion phrased as an observation rather than as an outcome.**

Note also what did NOT catch it. The change was reviewed while being written. Its
diff was read. The helper's docstring is careful and correct about identifier
quoting, several paragraphs long, and sits eight lines above the defect. Attention
was fully engaged on the file and on the right subject, and the bug shipped
anyway.

## How to apply

1. **Write the acceptance criterion before the code, and phrase it as an
   observation.** "Row X present with a number on both sides", "the count moved
   from 24 to 20", "the report NAMES this doc_no" — never "it passes", never
   "exit 0".
2. **Ask what a check that did nothing would print**, and make sure your
   criterion refuses it. If a no-op could satisfy the criterion, the criterion is
   about the process exiting, not about the work.
3. **When you write a warning at a site, ask which OTHER sites share the
   construct** and whether anything would make them fail. Grep for the construct,
   not the symptom — `::text` here, not "boolean". This is the sweep
   [[be-year-comes-after-the-timezone]] requires for a computation, applied to a
   hazard.
4. **Do not upgrade a comment into a promise.** A note at a line is worth writing
   and worth keeping; it is not coverage, and a plan that relies on someone
   reading it has no coverage at that point.
5. **Count the interval.** Here it was under an hour, in one session, by one
   author, with the warning in a sibling file. Any argument of the form "we wrote
   it down, so we will remember" has to survive that number.

---

**SOURCE:** `an-error-is-one-branch-not-the-defects-shape.md`

# An error you observed is one branch, not the defect's shape

**Applies to** the moment you write down what a defect DOES — in a status file,
a queue entry, a commit message, a severity call. Not to diagnosing the cause;
that is [[diagnosis-must-precede-the-fix]]. This is the step AFTER the cause is
correctly named, where the consequence gets recorded and the priority gets set.

**The rule:** the failure you saw is ONE BRANCH. Before recording it as the
defect's shape, ask **what in the DATA selected that branch, and whether that
condition is incidental.** Severity read off a single observation is the
severity of a single branch. An error is not the worst thing a defect can do —
it is evidence that on this input the bad path announced itself.

## The instance

`backup_db.py` interpolated a relation name into `from public.{t}` unquoted.
Run against a database holding `public."Odd Name"`, it produced:

    BACKUP FAILED: psql failed (1): ERROR:  relation "public.odd" does not exist
    LINE 1: select 'Odd Name' as t, count(*) as n from public.Odd Name u...

Exit 1, no artefact, and no `BACKUP_EXIT` line. From that single observation the
defect was written into `PROJECT_STATUS.md` and `OPEN_ITEMS.md`, at three
passages, as:

> **IT FAILS CLOSED, WHICH IS THE SAFE DIRECTION**: no dump, no manifest, no
> half-written artefact that could later be trusted … **The danger is the
> MISSING EXIT LINE, not a corrupt backup.**

**Every word of that is a correct description of what was observed, and the
conclusion is false.** Unquoted, `public.Odd Name` is VALID SQL: it names
relation `Odd` — folded by PostgreSQL to `odd` — with the ALIAS `Name`. It
errored only because no relation `odd` happened to exist.

Measured later, after adding a decoy `public.odd` (11 rows) beside
`public."Odd Name"` (13 rows), the same unquoted code returned:

    {'Odd Name': 11}

No error. No warning. Eleven rows recorded in the manifest for a table holding
thirteen. **The abort was the lucky case**, and the defect's real shape is a
backup that completes and records a count read from the wrong table.

## Why the wrong conclusion was so easy to reach

The error message is the trap. `relation "public.odd" does not exist` reads as
*the SQL is malformed* — the parser is complaining, so surely nothing could have
run. It is in fact the opposite: **the SQL was well formed and pointed at
something else.** A syntax error would have been safer, because a syntax error
cannot be satisfied by data.

Two other things made it comfortable. The exit code was 1, which everything in
this repo is trained to read as "it refused". And "fails closed" is a phrase with
a good reputation here — it is genuinely the right property in
[[config-defaults-must-fail-closed]] — so applying it felt like recognising a
known-good pattern rather than making a claim.

**The cost is not the wrong sentence. It is where the sentence lived.** Status
and queue files are what decide the order work gets done in. A defect that
silently writes wrong numbers into a backup manifest had been filed as the safe
one of three, in the two documents a future session reads to choose what to fix.

## The question that would have caught it, and it is one sentence

**"What would have to be true for this NOT to error?"**

The answer here was "a relation called `odd` exists" — an ordinary thing for a
database to contain, not an exotic one. The moment that answer is written down,
the severity inverts by itself. It costs one sentence and needs no experiment,
though the experiment afterwards is what turns it from an argument into a
measurement.

The same question is what separates this from [[a-backup-is-a-claim-until-it-is-restored]],
which is about not trusting an exit code that says SUCCESS. This is the mirror:
**do not trust an exit code that says FAILURE to tell you how bad the failure
is.** Both are the same underlying error — reading a process's status as a
description of what it did to the data.

## How to apply

1. **Before recording a defect's consequence, name the branch you observed.**
   "It aborted" is an observation. "It aborts" is a claim about every input, and
   it needs more than one input.
2. **Ask what in the data selected that branch**, and write the answer down. If
   the answer is a condition the world could easily satisfy — a name that
   happens to exist, a table that happens to be empty, a list that happens to
   have one element — the branch you saw is not the shape.
3. **Build the input that selects the OTHER branch**, and make its counts
   distinct so a wrong answer cannot coincidentally look right. Here that was a
   decoy relation at 11 rows beside the target at 13; identical counts would
   have hidden the substitution completely.
4. **Treat "fails closed" as a claim requiring proof, not a property you can
   recognise.** It is a statement that no input reaches the bad path, which is a
   claim about every input.
5. **When the correction lands, correct it where it was WRITTEN, at every site.**
   This one had reached three passages in two files; a search found them only
   after a first, broken search reported none — so count the sites, do not fix
   the first one you meet.
6. **A red is not self-explaining.** Ask of any failure whether it is the defect
   announcing itself or the defect being lucky, and say which in the write-up.

---

**SOURCE:** `be-year-comes-after-the-timezone.md`

# The BE year comes AFTER the timezone conversion — and an ISO-shaped BE date is a trap

**Rule.** `+543` is applied to a year that has *already* been converted to the
shop's timezone. Never to the year the instant happens to carry. And a Buddhist-era
date is rendered `DD/MM/BBBB`, never in ISO shape.

## Why the order cannot be a matter of taste

Once 543 has been added the value is no longer an instant, so there is no
"convert afterwards" — the operation does not exist. That means "+543 first"
always collapses to "never convert", which is right for most of the day and
wrong for every Bangkok morning before 07:00:

```
stored 2026-12-31T17:30Z  =  2027-01-01 00:30 Bangkok
  convert then +543  ->  01/01/2570     correct
  +543 then convert  ->  31/12/2569     wrong DAY and wrong YEAR
```

2569 there is not cosmetic. The server stamps `be_year 2570` on that bill's
`doc_no` and keys `doc_no_counters` on it, so the screen would name a different
business year than the legal document number does. Both numbers were verified
from real runs: `_be_year` returned 2570 and the mobile formatter returned 2570;
the wrong order returned 2569 on both sides.

**This is why the wrong order is dangerous rather than merely wrong: it is
invisible.** For an ordinary evening — 2026-07-26 22:09 Bangkok — both orders
print `26/07/2569`. Identical. So no spot-check, screenshot or afternoon of
manual testing can find it. It has to be proven *at the boundary*, and the proof
has to show the wrong order's output next to the right one or the case is
vacuous.

## Enforced by the compiler, not by a comment

`shopWallClock()` returns a *branded* `ShopWallClock`, and the private `beYear()`
takes only that type. Handing it a raw `new Date(iso)` does not compile:

```
error TS2345: Argument of type 'Date' is not assignable to parameter of
type 'ShopWallClock'. Property '__brand' is missing in type 'Date'.
```

A comment saying "convert first" is a note to whoever reads it. This is a rule
the build enforces on whoever doesn't — the same reasoning as
[[unavailable-is-not-rejected]]: put it in the type or the module boundary, not
in someone's memory. There is exactly ONE `+ BE_YEAR_OFFSET` on the client.

## Why DD/MM/BBBB and not ISO-style 2569-07-26

ISO shape looks like the safer, sortable choice. It is the more dangerous one:
`2569-07-26` is byte-for-byte the shape of a Gregorian ISO date, so it invites
the exact operation [[render-in-shop-time-not-device-time]] exists to kill — a
later `slice(0, 4)` or `new Date(s)` — and would then yield a year wrong by 543
with no visible symptom. `26/07/2569` cannot be mistaken for a machine-readable
instant by a human or by code.

The sortability argument was checked rather than assumed and does not apply: the
one sort in the app orders raw `created_at`, never rendered output. Never
abbreviate to `69`.

## The agreement has a real BOUND — don't "fix" it

The card's date and its `doc_no` year agree only when a bill is **received in the
shop year it was weighed in**. `created_at` is the weighing instant;
`be_year` derives from `server_received_at`, because doc_no is arrival order
([[doc-no-is-arrival-order-not-event-time]]). So a bill weighed 23:59 on 31 Dec
and synced after midnight legitimately shows `31/12/2569` beside `B-2570-n`.

That looks like the bug this lesson is about and is not. Deriving the *displayed*
date from `server_received_at` to make them match would relabel which day the
shop bought a load on — for every offline bill, not just at new year.

## AMENDED (2026-07-29): this lesson was written for production code, and the tests were never swept

Everything above was applied to `app/bills.py` and `shopTime.ts` when the defect
was found, and it held. Then, eight months later, the SAME expression was found
alive in three places in two proof scripts:

```python
prove_bills.py:35            BE_YEAR = datetime.now(tz=timezone.utc).year + 543
prove_master_data_gate.py    be_year = 2569   (two SQL predicates, one doc_no regex)
```

Nobody wrote a new bug. **The fix was applied to the site that had failed, and no
one asked where else the same computation lives.** `prove_backup_restore.py` had
imported `_be_year` all along with the note *"one BE-year source; never re-derive
+543"* — so one proof had it right and two did not, which is exactly the shape of
a rule that was communicated by fixing rather than by sweeping.

**What it would have cost.** Nothing, until 2027-01-01. Then, for the seven hours
between Bangkok midnight and 07:00 UTC, `prove_bills` would compute 2569 while
the server stamped 2570, and go red — on new year's day, with nobody having
touched the repository, over a defect the code does not have. A proof that fails
for a reason unrelated to the behaviour it tests is worse than no proof: it
teaches the next person that red means "look at the environment", which is the
belief that lets a real red through.

**The general form, and it is not about dates.** When a lesson fixes a
computation, the sweep is not done until every OTHER site of that computation has
been checked — **tests included**. Test code is the easiest place for the old
expression to survive: it is written to be independent of the implementation,
which is precisely what makes it re-derive the thing the implementation now owns.
"Independent reimplementation" is a virtue in an oracle only when the rule it
encodes is stable; for a rule that was just corrected, it is a copy of the bug
with a longer fuse.

So the closing step of any fix of this kind is a repo-wide grep for the
*expression*, not for the symptom — here `+ 543`, `.year`, a hardcoded `2569`, a
date literal in SQL, any UTC-based date arithmetic — across production code,
proofs, fakes and fixtures. That sweep was done on 2026-07-29 and the rest of the
repo is clean; what it found and why each surviving site is sound is recorded in
PROJECT_STATUS under that date.

Two sound-looking things it deliberately did NOT change, so the next sweep does
not churn them:

- **Fixed input → fixed expected** pairs (`proveTime.ts`, `proveClock.ts`): an
  assertion like `shopDate("2027-01-01T00:30:00Z") === "01/01/2570"` is a
  constant mapping and is correct forever. Only a *derivation from the current
  clock* is a time bomb.
- **Fake servers that emit `B-2569-n`** (`fakes.ts`, `fileServer.ts`): the year
  there is frozen deliberately. Making the fake derive the real year would add a
  clock dependency to tests that are currently deterministic, and nothing
  compares the fake's doc_no against a computed year — `doc_no` is an identifier,
  never a date ([[doc-no-is-arrival-order-not-event-time]]).

## AMENDED AGAIN (2026-08-02): the function was right — the INSTANT passed to it was wrong

Everything above is about the ORDER OF OPERATIONS inside the derivation. This one
got the derivation perfectly right and still put the wrong year on a legal
document, because of the ARGUMENT:

```python
be_year = _be_year(datetime.now(tz=timezone.utc))   # a SECOND clock, a SECOND moment
...
INSERT INTO purchase_bills (...)                     # server_received_at DEFAULT now()
```

`server_received_at` is Postgres' `now()` — **transaction start**. The `be_year`
came from a PYTHON read taken later in the same transaction, after the seller
lookup and every product and price lookup. Two clocks *and* two moments, a full
master-data round-trip apart. A submit beginning at 23:59:59.9 on 31 December
shop time and reaching that line after midnight took NEXT year's `be_year` on
LAST year's stamp.

**It was not a mislabel.** `doc_no_counters` is keyed on `(tenant_id, be_year)`,
so the bill OPENED THE WRONG COUNTER a year early. The new year's real first bill
then finds it at 1 and becomes `B-<year>-2`, and no `B-<year>-1` will ever exist:
a permanent gap in a document sequence, unrepairable, in the one table hard rule
5 forbids editing.

Measured before and after on the real `create_bill`, same lie, scratch copy:

| | doc_no | server_received_at | doc_no_counters |
|---|---|---|---|
| before | `B-2570-1` | BE 2569 | `{2569: 305, **2570: 1**}` |
| after | `B-2569-306` | BE 2569 | `{2569: 306}` |

**The rule this adds:** a value DERIVED from a timestamp must be derived from the
timestamp that is actually STORED — read once, then used for both. Never from a
fresh read of "the same kind of thing", however close the two look. `now()` and
`datetime.now()` are not the same clock, and even one clock read twice is not one
moment.

**And the fix is an ORDERING, never a tolerance.** The instinct is to allow a few
seconds of slack between the two reads. That leaves two reads. The instant is now
read FIRST, `be_year` is derived from it, and the SAME value is written to
`server_received_at` explicitly instead of leaving it to the column default —
because "they agree because both call `now()`" is a coupling the next reader has
to already know in order to see. One value, used twice, no window to be tolerant
about.

**Where proven.** `server/scripts/prove_docno_clock.py` — C1 puts the two
instants a straddling transaction really produces through the real `_be_year`
(150 ms apart, one BE year apart); C2 lies to Python's clock across new year and
drives the real `create_bill`, asserting the doc_no year, the counter key and the
stamp all agree and that no counter opened for the lied-about year. It refuses to
run against the live database, because against unfixed code the lie is itself the
corruption.

## How to apply

1. Shop timezone first, `+543` second. One year source, ideally typed shut.
2. BE dates are `DD/MM/BBBB`, display-only. Storage and the wire stay UTC ISO.
3. Prove it at the boundary AND show the wrong order's output. A green afternoon
   case proves nothing here — the two orders agree there.
4. Assert the UI year against the server's `be_year`, and assert that the wrong
   order would have *disagreed*, or the check does not discriminate.
5. Never let a rendered BE string be parsed, sorted, compared or stored.
6. When you fix one of these, grep the WHOLE repo for the expression before
   closing it out — production, proofs, fakes, fixtures. The fix is not the
   sweep, and the site that failed is rarely the only one.

**Where proven.** `mobile/src/proof/proveTime.ts` T7–T10: the reported card, the
order disproof over four instants (including the one where both orders agree),
UI↔`doc_no` agreement plus its wrong-order disproof, and negative assertions that
no `19xx/20xx` year survives into rendered output. Run twice under
`TZ=Asia/Bangkok` and `TZ=UTC` with identical rendered values. Server side,
`server/scripts/prove_shop_time.py` S1/S2 for `_be_year`, S3 for the wiring into
`doc_no` and the counter key.

---

**SOURCE:** `cached-master-data-is-a-price-claim.md`

# A cached price is a claim about today, and a backwards clock makes it look fresh

Applies to any value DEFAULTED from data the device cached earlier — prices,
tiers, rates — and to every age computed from a stored timestamp.

## The setup

Phase 2c-8 put products and sellers in SQLite so the yard can work with the
server down. That is required by hard rule 8. It also means the price the app
fills in is no longer a fact, it is a memory.

The server stamps `list_price` from the **current** list at sync time
(`server/app/bills.py`) and discards whatever the client sent. So a bill priced
from a stale cache arrives with `unit_price != list_price` — **byte-identical in
shape to a deliberate staff override**. The overpayment is real, banked, and
disguised as a decision somebody made.

## Rule 1 — a default from cached data needs an age, and an age needs a cutoff

This is NOT the same case as [[fallback-default-is-a-wrong-number]], and saying
it is would be sloppy: there the invented value could never make the operation
succeed, so it had no upside at all. A stale price CAN succeed — the server
accepts any `unit_price`. It has to be argued on its own, and it was, at length,
in `mobile/src/master/freshness.ts`.

The decision: past **12 hours**, do not default. Show the cached number beside
the empty box, labelled old, and let the operator type what was agreed.

Three things make that survivable, and without them the cutoff would be a bad
idea:

- it blocks **nothing** — seller, weighing, saving, queueing and syncing all
  work exactly as before;
- the cached number is still **shown**, so the operator is informed rather than
  blinded. Next to an empty box it is evidence; inside the box it is an
  assertion;
- 12 hours is the shortest window a working day cannot cross on its own, so it
  only ever fires when the device was out of contact while the yard was **shut
  and the office was open** — precisely when prices change.

## Rule 2 — the age is bounded by the OLDER half, and the clock check reads the NEWER

A price default needs two things: the product's tier list, and the seller's
grade to pick a tier with. They are fetched separately and can fail separately,
so a fresh product list does **not** rescue a week-old grade. `asOf` is the
minimum of the two.

**The bug this file exists for.** The clock-sanity check was written against
that same `asOf`, and it was wrong in the dangerous direction. Found by the C1
sweep in `proveCold`, not by reading:

> A stored timestamp in the FUTURE can only mean the device clock has moved
> **backwards** since it was written. A backwards clock makes `now - stored`
> smaller, so **every age is understated and old data looks fresh**.

Checking the *oldest* timestamp missed it whenever only one of the two lists was
affected: `Math.min` silently picked the other, still-plausible timestamp and the
assessment carried on. One list's clock damage condemns **both** ages, so:

```ts
const asOfMs      = Math.min(p, s);            // what we report, and gate on
const clockSuspect = now - Math.max(p, s) < -JUST_FETCHED_WINDOW_MS;  // NOT min
```

Two different questions over the same pair. Using one answer for both is the
shape of the mistake, and it will reappear anywhere a "worst case" and a
"sanity check" are computed off the same collection.

## Rule 3 — a delete-all refresh must be one transaction, timestamp included

A refresh **replaces** a list, so a seller the office deleted stops existing.
That is delete-all + insert-all + stamp. Outside a transaction, a failure in the
middle leaves half a list wearing a **fresh** timestamp — strictly worse than no
cache at all, because the operator is then told it is current. Proven with a real
constraint violation, not a stubbed throw (`proveCold` C3).

The same replacement creates a second hazard, which fails closed only if you make
it: a form holding `product_id` for a product the refresh has just removed. The
screen resolved the id for its *label* but passed the **raw form value** into
`buildLine`, which only checks that it is non-empty — so the line committed with
a blank product code, at a real price, and the server refused the whole bill
after the cash was paid. Pass the **resolved** row's id, so a row that has gone
away becomes "no product chosen".

## Rule 4 — stamp the provenance at the START of the bill, never at the save

The bill carries `master_as_of` — device-only; there is nowhere on the wire for
it. It is stamped when the draft is created, **not** when it is saved, because
the cache can only get newer while a cart is open. Stamping at save time reports
a refresh that arrived *after* the prices were typed: a false negative on a money
marker, which is the direction that hides things. The start time can overstate
staleness; a false positive costs someone a glance.

## What this does NOT solve — the part that needs a server field

`master_as_of` lives on the device. The device can always answer "was this bill
priced from old data". **The office cannot** — on the server the only symptom is
`unit_price != list_price`, which is the exact confusion above. Closing it needs
`purchase_bill_items.client_list_price` (the device's belief, which the client
already sends and `bills.py` deliberately discards) and
`purchase_bills.device_master_as_of`. Named at the foot of `freshness.ts` and
**not added** — owner's call.

## Related

[[fallback-default-is-a-wrong-number]] — the case where the default could never
succeed; this is its harder sibling, where it usually can.
[[sqlite-money-is-text]] — why the tier map is a TEXT column of JSON.
[[401-is-about-the-caller-not-the-bill]] — a persisted token can be expired on
restore, and offline that is unknowable; the 401 path is what resolves it, so
nothing here tries to guess.
[[render-in-shop-time-not-device-time]] — every timestamp in these messages goes
through the one formatter.

---

**SOURCE:** `concurrency-tests-need-a-barrier.md`

# A concurrency test without a start barrier proves nothing

**Context.** Phase 2b had to prove that `claimForSend` is atomic: two overlapping
sync passes must never both claim the same bill. The test spawns N worker
threads, each with its own connection to one SQLite file, all racing to claim
the same rows.

**Rule.** Any test claiming to prove behaviour *under concurrency* must (a) hold
every worker at an explicit barrier until all of them are ready, and (b) print
evidence that their working windows actually overlapped — e.g. the latest start
timestamp against the earliest finish. Without both, the test has not
demonstrated concurrency and must not be described as if it had.

**Why (the failure it prevents).** Spawning a thread costs far more than doing a
few hundred small writes. The first version of this test reported
`wins = 200 + 0 + 0 + 0`: worker 1 finished every claim before worker 2 finished
opening its connection. The run was green. It asserted "each row claimed exactly
once" and that assertion passed — on a workload that never had two claimers
alive at the same time. A broken, non-atomic claim would have passed it just as
happily. The danger is not the failing test, it is the **passing** one:
false proof of the single guarantee standing between the customer and duplicate
real-money bills.

With a `SharedArrayBuffer` + `Atomics.wait` barrier the same test reported
`0 + 0 + 84 + 216` wins with 900 lost races, and the overlap line showed all
four threads claiming simultaneously — that is a race.

**Generalises to.** Anything where "at the same time" is the property under
test: parallel API calls, DB row locks, file locks, queue consumers. Green means
nothing until you can show the workers overlapped.

**Where proven.** `mobile/src/proof/claimWorker.ts` (barrier) and
`mobile/src/proof/sqliteProof.ts` S3, which asserts the overlap itself as a
check rather than assuming it. Related: [[sync-state-needs-startup-recovery]].

---

**SOURCE:** `config-defaults-must-fail-closed.md`

# A default for a security secret is a default IDENTITY

**Rule.** Config that decides WHO SOMEONE IS gets no default value. Read it with
`os.environ["X"]`, never `os.environ.get("X", <fallback>)`, and treat an empty
string as absent. The process must refuse to start.

## What happened

`config.py` had:

```python
JWT_SECRET: str = os.environ.get("JWT_SECRET", "dev-only-insecure-secret-do-not-use-in-prod")
```

and that exact string was committed in `.env.example`. Two lines above it,
`APP_DATABASE_URL` used `os.environ[...]` and failed closed. The security-
critical one failed OPEN.

This is not theoretical. Verified against the running server: a token signed with
the published default, for a tenant we had no password for, carrying a `sub` that
matched no user, was accepted — returning that tenant's sellers and full price
list.

```
GET /sellers as forged tenant-B principal -> 200
  {"sellers":[{"name":"Seller of Shop B","grade":"A"}]}
```

The whole isolation stack — RLS, `SET LOCAL`, composite tenant FKs, a
`NOBYPASSRLS` role — worked perfectly and was irrelevant. It faithfully served
whatever tenant the forged token claimed. **Isolation enforces the identity it is
given; it cannot question where that identity came from.**

## Why a default is worse than a missing value

A missing value fails loudly on the first boot, in front of whoever is deploying.
A default fails silently, forever, and looks healthy: the service starts, serves
traffic, logs nothing unusual. Nothing about a running system reveals that its
signing key is the one in the public repo. The failure surfaces only as a breach.

The empty case is the same bug wearing a disguise: `.env.example` now ships
`JWT_SECRET=` with no value, and copying it yields `""` — which `os.environ[...]`
returns happily. Hence the explicit emptiness check.

## Testing note that cost a run

`load_dotenv()` does NOT resolve `.env` relative to the current directory. With
no arguments it walks up from the **calling file's** directory, so
`server/app/config.py` finds `server/.env` no matter where the process was
started. An attempt to prove fail-closed by running `uvicorn` from a scratch
directory therefore booted normally and hung, "disproving" a fix that was
correct.

To test config isolation, set the variable explicitly in the environment
(`load_dotenv` defaults to `override=False`, so a real env var wins), or use
`python -c`, where the caller frame is `<string>` and dotenv falls back to cwd.
Verify the guard fires; do not infer it from a process that failed to start for
some other reason ([[diagnosis-must-precede-the-fix]]).

## How to apply

1. Any secret, key, or credential: no default, ever. Empty counts as missing.
2. Grep for `environ.get(` with a second argument in config modules. Each hit is
   a question: what happens if this is wrong in production?
3. A committed example file must ship the KEY with no VALUE, plus the command to
   generate one. Never a working placeholder — placeholders get deployed.
4. When a config guard is added, prove it by real process startup, and know how
   your dotenv loader resolves paths before believing the result.

**Where proven.** `server/app/config.py`. Fail-closed shown two ways: absent →
`KeyError` at import, empty → `RuntimeError` killing a real `uvicorn` boot with
exit 1. The forged token that returned 200 before now returns 401, verified side
by side against both servers.

---

**SOURCE:** `console-is-not-the-observation.md`

# The console is not the observation — verify text at the source, in bytes

**Rule: never diagnose a text or encoding problem from terminal output, or from
anything piped through a tool whose default encoding follows the console
codepage. Check at the source: codepoints from the file, hex from the database,
`.decode('utf-8')` pinned explicitly on the wire.**

This dev machine runs `Active code page: 874` (Thai). Any UTF-8 that passes
through the console, or through a Python process reading stdin with default
encoding, is silently re-decoded as CP874 and comes out as plausible-looking
garbage.

## What happened

Checking the master-data endpoint before the Phase 2c-3 device test, the product
names came back looking corrupted:

```
"name": "เธญเธฅเธน..."
```

`เธ` is `เธ` — the textbook signature of UTF-8 bytes re-decoded as
TIS-620/CP874. It was `\uXXXX`-escaped output, which the console cannot alter,
so it looked like hard evidence that the seeded data was double-encoded. It was
not. The escaping happened *after* `python -m json.tool` had already mis-decoded
the pipe.

A second check "confirmed" it: reading the seed file printed `?????????????`.
That was `errors='replace'` plus the console again.

What the source actually says:

```
file codepoints : 0xe2d 0xe25 0xe39 0xe21 0xe34 ...   = อลูมิเนียมกระป๋อง
postgres hex    : e0b8ad e0b8a5 e0b8b9 e0b8a1 e0b8b4 ... (byte-identical)
API, pinned     : json.load(f, encoding='utf-8') -> clean Thai
chcp            : 874
```

Nothing was wrong anywhere. Three layers agreed; only the rendering disagreed.

## Why this one is dangerous

Most false positives waste time. This one is destructive. The "fix" for phantom
mojibake is to rewrite the strings — which would have taken correct UTF-8 and
replaced it with something derived from a broken reading, in seed data that
populates every new customer's database. The bug would have been *created* by
the investigation, and the next person to look would have found real corruption
with a commit that says it fixed corruption.

It also fails the honesty test in the worst way: it looks like evidence.
`\uXXXX` escapes feel authoritative precisely because they are ASCII and cannot
be mangled in transit — but they are computed from a string that was already
wrong.

## How to apply

- **Postgres:** `SELECT encode(convert_to(col,'UTF8'),'hex')`. Hex is
  codepage-proof. Compare against the source file's bytes.
- **Files:** read binary and print `[hex(ord(c)) for c in raw.decode('utf-8')]`.
  Never `print()` the string and judge by eye.
- **HTTP:** write the body to a file, then `open(path, encoding='utf-8')`. Never
  pipe a UTF-8 body into a tool that decodes stdin with the locale default.
- **Rule of thumb:** if the conclusion is "the data is corrupt", first prove the
  *reader* is correct. Corrupt-looking output has two candidate causes and the
  rendering path is by far the more common one.

## The general form

Kalāma says never assert what the server did from memory — only from an observed
response. This is the same discipline one layer deeper: **a rendering of a
response is not the response.** The console is a second system with its own
lossy transformation, exactly like Metro's file map in
[[metro-file-map-nesting]], where `fs.existsSync` said `true` and the bundler's
own index said `false`. Ask the layer that actually holds the truth, in a form
it cannot reformat: bytes.

## AMENDED 2026-08-18 (P1.12) — bytes are not enough when the two sides are in DIFFERENT encodings

**Everything above is about a READER decoding with the wrong codepage, and its
remedy is "compare bytes". That remedy is necessary and NOT sufficient, and this
amendment lives here rather than in its own file because the remedy is what
failed — a reader who follows the rule above and stops there lands in exactly
this hole.**

Scanning a Hermes bytecode bundle to confirm a string had reached the app:

```
needle "บิล" as UTF-8     -> count = 0     <- the confident false absence
needle "บิล" as UTF-16LE  -> count = 89
needle "shopDateTime"     -> count = 1     (ASCII, found)
needle "zzz-not-present"  -> count = 0     (ASCII, correctly absent)
```

**Nothing was decoded.** No console, no pipe, no locale default — the file was
read with `read_bytes()` and compared byte to byte, which is what the rule above
prescribes. The instrument was correct and the NEEDLE was wrong: Hermes stores
non-ASCII strings as UTF-16LE, so a UTF-8 needle cannot match a string that is
certainly there.

**Why it is the same lesson and not a new one.** The output is a CONFIDENT FALSE
ABSENCE about the artefact, and the natural response to it is to go and "fix"
strings that were never broken — the same destructive direction as the phantom
mojibake above, reached from the opposite end. There the reader corrupted
correct data; here the search failed to find correct data. Both end with an
author editing text that was right.

**AND THE CONTROL WAS THE WRONG CONTROL, which is the part worth carrying.** The
absence was paired with ASCII PRESENT needles (`shopDateTime`,
`SHOP_UTC_OFFSET_MINUTES`, both found) and ASCII ABSENT needles (both zero). All
four behaved, and none of them could move: they proved the scan worked on ASCII
and said nothing whatever about Thai, which is the only thing in question. A
control must contain what fooled you — [[a-control-must-contain-what-fooled-you]]
— and here that means a needle in the SAME encoding class as the one whose
absence you are about to believe.

**How to apply.** Establish the STORE's encoding before searching it, not after a
zero. Where you cannot, search for the same string in every plausible encoding in
ONE run and require exactly one to hit — the evidence is the PAIR (0 and 89), not
either number. And never report "the string is not in the artefact" from a single
encoding's miss.

**Two homes, one test.** A LESSON, not a machine footgun: Hermes stores UTF-16LE
on every platform it runs on, so this is not a property of this box, and a
session on any machine would relearn it. It is also NOT the never-went-red
family — nothing here is a vacuous assertion, the scan fired correctly and
answered the question it was actually asked.

**Where found.** Phase 2c-3, verifying `/products` before the on-device cart
test. No code changed as a result — the correct outcome was a retraction.

---

**SOURCE:** `correct-classification-can-still-render-as-an-error.md`

# A correct classification is not correct behaviour until the screen agrees

Applies to every state a user can see that the system distinguishes internally:
retryable vs terminal, parked vs failed, degraded vs down, pending vs stuck. The
classification is only half the feature. **The other half is on the screen, and
it can be wrong while everything behind it is right.**

## What happened

Phase 2c-6, first device pass. A bill for a seller with no grade rendered as:

```
ผิดพลาด: HTTP 424: {"kind":"master_data_missing","code":"seller_grade_unset",
"message":"ผู้ขายรายนี้ยังไม่ได้กำหนดเกรด จึงยังไม่มีราคาตั้งต้น",
"seller_id":"aaaa0000-0000-0000-0000-0000000000aa"}
```

In red. On a phone. In a yard.

Now the uncomfortable part — **every layer underneath was correct**:

| layer | did the right thing |
|---|---|
| server | returned `424` + a machine-readable `code`, not `422` |
| transport | classified it `rejected_resolvable`, carried the code through |
| engine | called `markMasterDataMissing`, not `markFailed` |
| SQLite | `sync_state='pending'`, `master_data_missing_at` set, still owed |
| queue | excluded from `QUEUED`, so it blocked nothing |
| proofs | `proveSync` CASE 10 green: parked, not failed, non-blocking |

Nothing was broken. The three-way classification of
[[unavailable-is-not-rejected]] worked end to end. And the product still told the
operator their bill had failed — the exact conclusion the whole classification
exists to prevent them from reaching.

The render was one line, gated on the wrong thing:

```tsx
{b.last_error !== null && !voided ? (
  <Text style={styles.err}>ผิดพลาด: {b.last_error}</Text>
) : null}
```

`last_error` is non-null for a parked bill — correctly, it is the diagnostic. The
UI had no concept of "parked" at all, so every non-success collapsed into one red
sentence. A yard sees red and re-weighs a load, or calls the office about a bill
that needed no call.

## A developer diagnostic and an operator message are different artifacts

`last_error` holding `HTTP 424: {…json…}` is **right**. It is the breadcrumb that
pairs with the server's `BILL_POISON_CANDIDATE` log line, and it is how a jam
gets diagnosed after the fact. Keep it.

What is wrong is *rendering* it. These two artifacts have different audiences,
different lifetimes and different content rules:

|  | developer diagnostic | operator message |
|---|---|---|
| audience | someone reading a bug report | someone with wet hands and a queue |
| content | status, codes, ids, raw body | one instruction, in Thai |
| built by | the transport, once | the UI, from a code |
| may contain a UUID | yes | never |

**A string is not promoted to a user message by being displayed.** If a field was
built for diagnosis, no amount of putting it in a `<Text>` makes it an
explanation. The two must be produced by different code paths, or the diagnostic
will leak the moment someone adds a state the UI has not been taught.

## The second defect, same family: the wrong instruction

`StatusStrip` already had a dedicated amber message for parked bills — someone
had thought about this — but it hardcoded one cause:

```
N ใบรอราคาสินค้า — ยังไม่ได้ตั้งราคาสำหรับเกรดของผู้ขายรายนี้
```

For `product_price_unset` that is right. For `seller_grade_unset` it is a
**confidently wrong instruction**: the office goes and sets a product price, and
the bill does not move, because what it is waiting for is the seller's grade.

This is worse than a vague message, and the reason is specific: **a vague message
makes someone investigate; a wrong one makes someone act.** The office does the
work, nothing is released, and now the system has also spent its credibility —
next time the amber strip appears it gets ignored. A message that names an action
must be derived from the cause, never from the most common cause.

## Why the mapper is pure and takes only the code

`src/sync/parkedReason.ts` takes `code: string | null`. That is the entire
signature, and it is chosen so the leak is **unrepresentable**, not merely
avoided:

- there is no `bill`, no `response`, no `detail`, no `last_error` parameter, so no
  caller can pass a body in even by accident;
- it returns finished Thai sentences, not a key the caller must look up — a
  mapping that hands back an identifier is a mapping that can be bypassed by a
  caller in a hurry;
- being pure and in `src/`, it is reachable by a headless proof, which `app/`
  files are not (`tsconfig.node.json` has `rootDir: "src"`).

An unknown code degrades to a generic sentence plus the code **alone**, so the
next cause the server invents is readable on an un-updated device instead of
blank or raw.

## The first fix was a gate, and the gate had a hole

The first attempt kept the raw-error line and added a condition:

```tsx
{b.last_error !== null && !voided && !parked ? … }
```

That is correct for every state anyone thought of. The second device pass found
the one nobody did. While **ส่งอีกครั้ง** retries a parked bill,
`releaseMasterDataBlocked` had cleared `master_data_missing_at` and
`master_data_code` but **left `last_error`** — so for the length of the request
the row simultaneously said *not parked* and *here is why it was parked*, `parked`
computed false, and the exact red JSON came back. It self-corrected when the
server answered, which is worse, not better: a defect that repairs itself in a
second is one no bug report ever captures.

Two things were wrong and both are worth separating:

**The cause was a half-update, not a rendering bug.** Compare the transitions:
`markSynced` had always cleared `last_error` alongside the columns that justified
it; `releaseMasterDataBlocked` cleared the state and kept the text. **No
transition may leave behind an error describing a state it has just left.** Grep
every `UPDATE`/mutation that retires a state for whether it also retires that
state's explanation. (Both stores needed it — `SqliteLocalStore` *and* the
in-memory fake, or the suite would run the same case against two different
behaviours and one of them would be a lie.)

**The gate was the wrong shape.** Enumerating states in a view condition is a
standing invitation to miss one, and the miss is invisible until someone happens
to look during a 300ms window. So the view stopped seeing `last_error` at all:
`billNotice(bill)` is now the single pure function that decides what a bill says,
the proof enumerates states over *that* rather than over a screen, and the
remaining guarantee is an invariant instead of a condition — **`last_error` can
hold a 424 body only while the bill is parked**, because
`markMasterDataMissing` is its only writer and every other transition overwrites
or clears it.

> A gate you have to remember is a bug you have not found yet. Prefer a shape
> where the leak is unrepresentable.

## Why every proof was green

This is the sharpest part. Nothing lied. The proofs asserted the *state*:
`sync_state`, `master_data_code`, `masterDataBlockedCount`, `behind === 0`,
doc_no ordering. All true. **Not one of them asserted anything about what the
operator reads.** The screen was outside the proven surface entirely, so the
suite could not have caught this — it was not a weak test, it was an absent one.

That puts this in the family with [[proof-must-run-twice]],
[[concurrency-tests-need-a-barrier]], [[schema-audit]] and
[[metro-file-map-nesting]]: **a passing result is only evidence if you know what
would have made it fail.** Here the answer was "nothing" — no assertion existed
that a red error message could have broken.

`proveSeller` S7 now asserts on the rendered text, and it asserts *negatively*:
the operator-facing string must not contain JSON punctuation, `kind`,
`master_data_missing`, `_unset`, `424` or a UUID — checked against the byte-exact
diagnostic the transport builds. S8 does the same for the **in-flight** states,
against the real `SqliteLocalStore` and the real release path, because that
defect lived in a SQL `UPDATE` and a fake would have proven the fake.

Both checks were confirmed non-vacuous by running them on the pre-fix state,
where all six body fragments fire.

One refinement worth recording, because the proof got it wrong first: **ผิดพลาด
is not unconditionally forbidden.** S8 initially banned the word in every state
and failed on a genuine 422 — which *is* an error and must say so, loudly. The
rule is narrower than "never say error": never call a RESOLVABLE refusal one. So
body fragments are banned in all states; the error word is banned in every tone
except `error`. An over-broad assertion is its own kind of wrong, and it would
have pushed the fix toward silencing real failures.

## How to apply

1. For every internal state, ask **what does the screen say** — not "is the state
   correct". Read the actual render path. The state being right is the setup, not
   the outcome.
2. Never render a field built for diagnosis. Grep the UI for the diagnostic field
   names (`last_error`, `detail`, `stack`, `raw`); each hit is a leak or needs a
   comment saying why it is not. Better: make the view unable to see them.
3. Any message that tells someone what to do must be **derived from the cause**.
   Hardcoding the common case ships a wrong instruction for the rest.
4. Put the mapping where a proof can reach it, take only the classification as
   input, and assert **negatively** on the output — what must never appear. The
   positive wording will drift; "no UUID on screen" will not.
5. Enumerate the **transitional** states too, not just the settled ones. Ask what
   the screen says *while* a retry is in flight. Those windows are short, they
   self-correct, and they are therefore the ones that reach production.
6. When retiring a state, retire its explanation in the same write — and apply it
   to every store implementation, not just the real one.
7. A resolvable refusal is amber and says who will fix it. Red is for
   [[queue-jam-must-be-visible]] — something that needs a human now.

## Amendment (2c-7): the fix covered the state that bit, and left its neighbours

Everything above was applied to the PARKED case, because that is the one that
appeared on a phone. Three states next to it were left exactly as they were, and
two of them were the same defect verbatim:

- **an OFFLINE bill.** `billNotice` still rendered `ผิดพลาด: ${last_error}` for
  any non-null `last_error` that was not parked — so every offline card in the
  yard read `ผิดพลาด: network: Network request failed`, in red, while the status
  strip two centimetres above it said ออฟไลน์. The invariant recorded above
  ("`last_error` can only hold a 424 body while parked, so tone: error can never
  carry one") was true, and beside the point: it proved the *424* could not leak
  while every *other* diagnostic still did.
- **an expired session**, which had no representation at all. See
  [[401-is-about-the-caller-not-the-bill]].
- **a terminally failed bill**, which offered a ยกเลิก button and promised
  "รอส่งบิลเข้าระบบก่อน แล้วจะยกเลิกให้อัตโนมัติ". `listVoidsToApply` requires
  `sync_state='synced'` and nothing moves a failed bill there, so that promise
  could never come true — on a bill for which cash had been paid and the server
  holds no record whatsoever.

**Fixing the instance instead of the class is what produced all three.** The
2c-6 fix asked "what does the screen say for a PARKED bill". The question that
would have caught these is "what does the screen say for EVERY state", and it is
answered by enumeration, not by inspection — `proveNotice` now sweeps the full
cross product (96 card cells, 32 void, 144 strip) and asserts properties over all
of it, rather than sampling the states someone thought of.

Three refinements worth separating out:

**A parameter you do not have cannot leak.** Point 4 above said to take only the
classification as input. `billNotice` had kept `last_error` "for the error case",
which is how the error case kept printing it. It now takes `sync_state` and
`attempt_count`; the tone is derived from state (`error` ⟺ `sync_state ===
"failed"`, and `markFailed` is its only writer) and there is no longer any value
the function could render a diagnostic from. That is strictly stronger than an
invariant about who writes the column, because it survives someone adding a
writer.

**Never promise what the system cannot perform.** A message can be free of
jargon, calm, correctly classified — and still be a lie about the future. The
void line branched on `doc_no`, which answers "has it got a number yet" when the
question is "can it ever get one". Where the answer is never, the card must say
so and the button must go: an offered action the system cannot carry out is worse
than no action, because someone stops looking for the real one. What replaces it
names the office and keeps the row, because on a bill the server never received,
that row is the only evidence the purchase happened (hard rule 5).

**Narrowing does not cross a closure.** `notice.tone !== "none"` narrows at the
element and silently evaporates inside the `.map` callback — TypeScript cannot
know the property is unchanged by the time the closure runs. The honest fix is to
pass the narrowed value across a typed boundary (`tone: Exclude<NoticeTone,
"none">` as a prop) so the compiler carries the guarantee; a cast or a `!` there
re-asserts by hand exactly what the compiler just refused to grant. Caught only
by `npm run typecheck:app`, which is the second time the separately-typechecked
Expo program has been the one to find something — see the footnote below.

## Amendment (2d): one server code, two actions — the wording assumed the action

Point 3 above says a message that names an action must be derived from the cause.
This phase found the case where **the cause does not determine the action**, and
the wording had quietly assumed it did.

`server/app/auth.py` has ONE `require_admin`, so it answers **`admin_required`**
for every admin-only path there is. When voiding was the only such path a phone
could reach, `forbiddenReason("admin_required")` could hardcode:

```
บัญชีนี้ไม่มีสิทธิ์ยกเลิกบิล ระบบจึงยังไม่ได้ยกเลิกบิลใบนี้ — ต้องแจ้งเจ้าของร้าน
```

That is right, and it stayed right for exactly as long as there was one caller.
The daily money view is the second admin-only path a client can hit, and it
returns the same code — so a staff account opening the takings would have been
told, on a read-only report, that a bill they never touched had not been
cancelled. **Every layer was correct again**: the server's status, the client's
403 classification, the tone, the no-sign-in rule, the "name the owner" rule. Only
the sentence was about something that never happened.

The distinction to carry:

> A server's `code` names the **rule that refused**, not the **action that was
> refused**. If one code serves N call sites, the wording is a function of
> (code, call site) — and the call site is the part the code cannot tell you.

The fix is a REQUIRED `action` argument (`forbiddenReason(code, "void_bill")`),
not an optional one with a default. A default would have kept the void sentence as
the fallback for every future path, which is the same bug wearing a parameter. A
required argument makes the third admin-only screen a compile error at the wording
table until someone writes its sentence — the same "make the wrong thing not
compile" move as the branded `ShopWallClock` and the `Exclude<NoticeTone, "none">`
prop above.

**How to spot it before it ships:** for every constant in a wording table, ask
*how many things can produce this key*. One-to-one is safe; many-to-one is a
sentence waiting to be wrong somewhere the author was not looking. Grep the
server for the code — `admin_required` appears once, in a dependency used by
sixteen routes, and that count is the whole warning.

### Rider: a banned-substring list is context-dependent too

Point 4 says to assert negatively, and this phase copied `proveNotice`'s list of
forbidden fragments onto the money screen — where it immediately went red on
`รวม 500 ใบ`, a legitimate count of voided bills read as a leaked 5xx status. The
list was not wrong before and was not wrong after; **it was wrong once moved**,
because on a bill card no bare number is legitimate and on a money report almost
every number is.

The repair is worth more than the report: the enumerated statuses became
`/\b[45]\d\d\b/` applied only to the screens that carry no counts at all. That is
strictly stronger than the list it replaced — it catches `418`, and every other
status nobody thought to enumerate. Enumerating the statuses to ban is the same
shape as enumerating the states to gate, and this lesson already says what to do
about that: fix the class, not the instance.

## Amendment (R2b): a wait is a promise too, and the exit was on the same screen

Point 3 says a message naming an action must be derived from the cause. The 2d
amendment sharpened that: wording is a function of (code, call site), and the
call site is the part the code cannot tell you. This is the third form, and the
missing input is not a server code at all — it is a **device-global state the
renderer was never given**.

`signOutCard` took `pending`, `failed` and `failure`. `pending > 0` is a fact
about the queue and it was never wrong. What it cannot carry is *why* the queue
is not moving, and there are two whys with opposite instructions:

| why the queue will not drain | what is actually true |
|---|---|
| the phone is offline | the network returning drains it — waiting IS the fix |
| the token is dead | nothing drains it; only a sign-in does |

Having one input for two causes, the sheet said the offline sentences for both.
Read off a real iPhone on 2026-08-07, at full signal, with the server answering
401 to every request:

```
ยังออกจากระบบไม่ได้ / มีบิลรอส่งขึ้นระบบ 1 ใบ /
การเข้าสู่ระบบครั้งต่อไปต้องใช้อินเทอร์เน็ตอยู่แล้ว และเมื่อเชื่อมต่อได้ บิลจะส่งเองภายในไม่กี่วินาที /
รอให้ส่งครบก่อน แล้วจึงออกจากระบบได้
```

Two of those sentences were false. The bills would not go when the connection
came back — it was already back. And *wait until they are all sent* names a
condition that could not arrive.

**A WAIT IS A PROMISE ABOUT THE FUTURE, exactly as much as an action is.** The
2c-7 rule above — *never promise what the system cannot perform* — was written
about an offered button (`จะดำเนินการให้อัตโนมัติ` on a bill that could never
sync) and was read ever since as being about buttons. It covers "we will do this
for you" and "wait and it will finish" identically. The second form is harder to
see precisely because it offers nothing: there is no control to audit, only a
sentence, and a sentence that asks for patience reads as the humble option.

**And the part that generalises is worse than a false sentence: the exit existed,
on the same screen, two centimetres up.** The status strip was drawing
`หมดเวลาเข้าใช้งาน — ต้องเข้าสู่ระบบใหม่` with a working sign-in button, and
pressing it posted the queued bill immediately. So this was never a deadlock —
it was a renderer that could not see an exit it was standing beside, because it
had no input for why the state held. Ask of any refusal screen: **is the thing
that resolves this already visible somewhere else in the app?** If it is, the
refusal is not merely under-informative, it is contradicted by its own neighbour.

The fix is 2d's move one level down: `session: SessionState` added to
`SignOutCardInput` as a **required** field, never optional with `"active"` as a
default — a default would have left every existing call site rendering the
offline sentence while compiling clean, which is the same bug wearing a
parameter. Making it required turned eight call sites into compile errors, which
is how the sweep was known to be complete rather than remembered. The sheet's
`onAction` became an exhaustive `switch` with a `never` arm in the same change,
because adding `sign_in` to the action union compiled clean against the old
`if (dismiss) … else signOut()` and would have routed the new button into the
sign-out path — where the gate refuses it. **A green button that does nothing is
a worse defect than the one being fixed**, and nothing but exhaustiveness was
going to say so.

**The proof is the PAIRING, not the assertion.** `proveSignOut.ts` S9 drives the
real `SyncEngine` against a 401 transport and against an offline one, reads
`pending` off the real store in both, and asserts the two rendered sheets DIFFER
from an identical measured count. Either half alone is worthless: without the
offline half, hardcoding the new sentences into both branches passes; without the
dead half there is nothing to distinguish. Breaking the branch back to its
shipped form turned ten cells red and left the offline half green — see
[[a-check-that-never-went-red-was-never-observed]] for why that split is the
evidence and not the ten.

One correction this amendment carries, because the instance was mis-recorded
while it was undiagnosed: **the status strip was never defective.** It classified
the 401 correctly the whole time. See
[[two-green-proofs-do-not-cover-the-seam]], whose account of this same defect is
corrected in the same commit.

## Footnote: the fix nearly broke the void path

Naming the local `const reason = parkedReason(...)` inside the bill `.map()`
shadowed `BillsPanel`'s `const [reason, setReason] = useState("")` — the void
reason, proven in 2c-5. It would have silently detached the TextInput from its
state. Caught only because the Expo program is typechecked **separately**
(`npm run typecheck:app`), and nearly missed again because that command had been
chained as `npm run typecheck:app 2>&1 | tail -3 && echo CLEAN` — `tail` exits 0,
so the failure was reported as clean. Run each typecheck bare, with its exit code
visible. Never let a pipe decide whether a check passed.

## Amendment (P1.8a phase 2): one STATUS, two meanings, and the body was not available to tell them apart

The 2d amendment above is about one CODE serving N call sites, and its answer is
to make the call site an input. **This is the mirror image, and it has a
different answer: one STATUS serving two CODES at ONE call site.**

`POST /sellers` answers 409 for two different things:

| the server's code | when | the instruction |
|---|---|---|
| `duplicate_code` | the caller SUPPLIED a code and it is taken | type a different one |
| `code_assignment_failed` | the caller supplied NO code, and generate-then-retry gave up | type a code yourself |

Those instructions are opposites, and the server already refuses to conflate
them — `server/app/master.py`, at the raise: *"NOT duplicate_code. The caller
supplied no code, so naming one as taken would be a confident lie about a value
they never sent."* A client that maps 409 onto "that code is taken" tells
somebody who typed nothing that the thing they did not type is taken. That is
2c-6's wrong instruction one layer out, and it makes the office go looking for a
collision that does not exist.

**THE OBVIOUS FIX IS FORBIDDEN ON THIS ROUTE.** Read `detail.code` off the body
and branch on it. Every other refusal in this client is classified on the STATUS
precisely so the classification survives a body that will not parse
(`adapters/httpTransport.ts`, the 403 and 424 paths) — and on THIS route the
refusal body is the one that can echo an ID CARD NUMBER,
[[a-refusal-hands-back-what-it-refused]]. So two rules that normally cooperate
collide here: the status is not enough, and the body is not available.

**THE DISCRIMINATOR WAS IN THE REQUEST.** `duplicate_code` is reachable only when
a code was supplied and `code_assignment_failed` only when one was not, so the
caller already holds the answer before the request leaves:

```ts
const suppliedCode = draft.code !== undefined;   // read once, at the top
...
if (status === 409) {
  return suppliedCode ? { kind: "duplicate_code" } : { kind: "code_assignment_failed" };
}
```

Ask, of any status that can mean two things: **is there a fact the CALLER already
holds that separates them?** A value taken from the request cannot be corrupted
by the response, cannot be missing, and needs no parse — so a classification
built on it is right even when the body is unreadable, which is the property the
status-only rule was buying in the first place.

**THE RESIDUAL, STATED RATHER THAN HIDDEN.** One refusal is still collapsed.
`code_assignment_overflow` is a server-named 422 whose real instruction is also
"type a code yourself", and it lands in the generic `invalid` member. Telling it
from a pydantic 422 needs the body, and the body of a 422 on this route is the
one that mirrors the input. It is reachable only if a shop has typed an S-code
longer than 64 characters by hand — the server's own comment says so — and a
generic sentence in that case is the price of a union that cannot leak. Recorded
so the next author meets it as a decision and not as a bug.

**Where measured.** `mobile/src/master/createSeller.ts`, proven by
`mobile/src/proof/proveSellerCreate.ts` C3 against a real server bound to
`recycle_p18a_scratch`: the cell asserts WHICH member comes back, not that the
call failed, because "it failed" is satisfied by a 500, by an outage and by a
route that does not exist.

## Amendment (P-GRADECARD, 2026-08-18): the code names the CAUSE, and the REMEDIES are not a function of it

Point 3 at the top of this file says a message naming an action must be DERIVED
FROM THE CAUSE. Every amendment since has been about the derivation having too
little input: 2d added the call site, R2b added a device-global state, P1.8a
phase 2 found a status that could not name its own code. **This one is
different, and it is the uncomfortable case: the cause was right, the derivation
was right, and the sentence was still the wrong shape — because a refusal can
have MORE THAN ONE remedy, and the code names one of them.**

`9ad225e` gave `POST /bills` a fallback to `tenants.default_grade`, so
`seller_grade_unset` is raised only when the seller's grade AND the shop's
default are both unset. Either one being set releases the same bill, unchanged.
`parkedReason.ts` went on saying:

```
ผู้ขายรายนี้ยังไม่ได้กำหนดเกรด จึงยังไม่มีราคาตามเกรด — ให้สำนักงานกำหนดเกรดของผู้ขายรายนี้
```

**IT WAS NEVER FALSE, and that is the whole difficulty.** The card is drawn only
after the server has already refused, so "this seller has no grade" is true every
single time it appears. No assertion of the form *does this sentence match its
cause* could fire; nothing was stale; nothing failed to compile. What was wrong
is the SHAPE: it named the remedy that must be repeated for every walk-in and
never the one that fixes the shop once — which is the remedy the shop shape the
fallback was ADDED FOR actually needs. A wrong-shaped instruction is acted on
exactly like a wrong one, which is 2c-6's own finding about the price wording,
arriving by a route 2c-6 could not have predicted.

**WHAT MAKES IT INVISIBLE FROM THE CLIENT, and this is the part that
generalises. The server-side change that created it ADDED NO CODE.**
`MASTER_DATA_CODES` in `mobile/src/sync/parkedReason.ts` carries a warning in
its own docstring about exactly one hazard — a code added on the server and not
mirrored here, which reaches the yard through the unknown fallback — and that
tripwire is aimed at ADDITION. A NARROWING adds nothing, removes nothing and
renames nothing: the client's mapping stays complete, every code stays
recognised, and the unknown branch is never reached.

> **The set of CODES is a poor proxy for the set of REMEDIES, and it is the only
> one of the two the client can see.** 2d established that a code names the RULE
> THAT REFUSED rather than the action refused. This adds the other half: it does
> not name the set of changes that would make the same request succeed either,
> and that set can GROW on the server with no signal of any kind reaching the
> client.

**WHY THE STANDARD FIX DOES NOT APPLY, stated because reaching for it is the
obvious move.** 2d and R2b both repair a missing input by making it a REQUIRED
parameter, so the next call site is a compile error until someone writes its
sentence. There is no such input here. The second remedy is a fact about the
SERVER'S RULE — not about the caller, not about the call site, not about any
device-global state — so there is nothing the client could be handed. And
ASKING (`GET /shop`) is worse than useless: it would let the device claim which
of the two the shop lacks, which it must not do, because the same code can
arrive from a server build that has no shop default at all. **The sentence names
BOTH remedies and asserts NEITHER**, and the office chooses.

**The badge was deliberately left alone.** Its own field docstring says its job
is to name WHO the bill is waiting for, and WHO did not move: it is still the
office. It is also never drawn without the sentence beside it.

**How it was proven, and the disproof cost nothing because the defect was
already in the tree.** The new assertion is NEGATIVE — the drawn text may not
name one remedy without the other — asserted over the CONCATENATION in draw
order through `billNotice`, and it was run against the UNCHANGED wording first:
exactly three cells red, all three named in advance, no fourth cell moving.
Three things worth separating out:

- **A presence sibling was required, not optional.** `namesA !== namesB` is
  false for a card naming NEITHER remedy, so the negative cell alone is
  satisfied by silence — the ninth mechanism in
  [[a-check-that-never-went-red-was-never-observed]], an absence assertion over
  an empty haystack. The sibling asserts both are present, in the same string.
- **The positive control has to be a LITERAL here**, which is normally the
  thing [[a-differential-control-is-only-as-good-as-its-weaker-side]] forbids.
  After the fix the live function can no longer make the predicate true, so
  without the shipped wording kept in the file there is no input left that the
  instrument is known to catch. The literal is the control; the derived value
  is the claim; they are different cells and the text says which is which.
- **The sentence is drawn on TWO surfaces and the second was nearly missed.**
  `billNotice` puts it on the bill card under a badge; `parkedSummary` puts it
  on the status strip with NO badge at all. Two renderers, one sentence, and the
  strip is what an operator reads when several bills are parked at once — the
  seam [[two-green-proofs-do-not-cover-the-seam]] describes. Both are asserted.

**RECORDED AND NOT FIXED:** the server's code is named `seller_grade_unset`,
after ONE of the two causes it can now stand for. Renaming it is a client
contract and `MASTER_DATA_CODES` is a closed union that would move with it, so
it is a decision and not a tidy-up.

**How to apply.** Ask of any refusal sentence: **how many DIFFERENT changes
would make this same request succeed?** One is safe. More than one, and the
sentence must name them all, or name who chooses — never the first one somebody
implemented. And when a SERVER change narrows a refusal, sweep the client
wording for that code in the same pass: nothing will go red, nothing will fail
to compile, and the sentence will still be true.

---

**SOURCE:** `decimal-precision-for-domain-scale.md`

# Decimal precision must be set for the domain's scale, not left at the default

**Rule: a decimal library's `precision` setting is a correctness parameter and
must be verified against the declared scale of the columns it computes over —
`NUMERIC(14,3) × NUMERIC(14,2)` here — not left at the library default, and not
sized to the values you expect to see.**

This is written down as a lesson rather than only as a comment beside the
setting, because a lone `precision: 50` in a config block reads as arbitrary
and invites a future tidy-up back to the default. The reason has to outlive the
line.

## The trap

decimal.js defaults to `precision: 20`. That is not a display setting. It is
applied to the result of **every arithmetic operation** — the intermediate
product is rounded to 20 significant digits before anything else happens, so
the digits are gone long before the final `quantize`/`toFixed(2)`.

Our declared scales permit more than that:

| operand | max value | digits |
|---|---|---|
| `net_weight` `NUMERIC(14,3)` | `99999999999.999` | 14 |
| `unit_price` `NUMERIC(14,2)` | `999999999999.99` | 14 |
| product | `99999999999998000000000.00001` | **28** |

Twenty-eight significant digits, against a default of twenty.

## Observed

Two operands, each legal for its column — `12345678901.234` fits
`NUMERIC(14,3)`, `98765432109.87` fits `NUMERIC(14,2)`:

```
prec20 -> 1219326311370081084000.00
prec50 -> 1219326311370081083966.58     <- exact
```

Wrong by **33.42**. Not a half-satang rounding tie — the low digits are
replaced with zeros. The database would have accepted the value, and the
server's own Python `Decimal` (which has no such default cap) would have
computed the correct one, so the bill would have been rejected on total
mismatch with no indication that the *client's* precision was the cause.

## Why it would have survived review

At any weight and price a scrap yard actually sees, precision 20 is correct.
The loss only begins once the product needs more than 20 significant digits —
around 10^15 baht on one line. Every realistic test case passes. Every code
review sees plausible arithmetic. The bug is reachable only through the range
the *schema* permits, which is why the schema's declared scale is the right
bound to size against and "the numbers are never that big" is not an argument
([[schema-audit]] — the declared field is the contract, regardless of what the
data happens to contain today).

## How to apply

1. Take the declared precision/scale of every column that feeds the
   computation. Add the digit counts across a multiply; that is the worst case.
2. Set the library's precision comfortably above it (we use 50 against a
   worst case of 28) and say in the code *which* column scales produced the
   number.
3. Assert it. A proof case at the top of the permitted range fails loudly if
   someone restores the default; a proof case at realistic magnitudes does not
   ([[proof-must-run-twice]] — know what would have made it fail).
4. Re-derive it whenever a migration widens a money or weight column. The
   precision setting is downstream of the schema and does not update itself.

The same question applies to any decimal library, not just decimal.js: find its
default, find whether it applies per-operation or only at output, and check it
against the domain. Python's `decimal` defaults to 28 significant digits — also
finite, also per-operation, and also worth checking rather than assuming the
server side is automatically safe.

Related: [[sqlite-money-is-text]] — the other place where a money value silently
loses exactness on the client, there through SQLite's type affinity rather than
through a library default.

---

**SOURCE:** `diagnosis-must-precede-the-fix.md`

# Diagnose before you fix: read the real error and the real files first

A failing result is evidence that something is wrong. It is NOT evidence of WHAT
is wrong. Naming the cause is a separate act — and it is the one most easily
skipped, because a plausible story is usually already waiting.

## What happened

A login started returning HTTP 500. A ready-made story was at hand: a column,
`first_server_error_at`, had just been added in a mobile migration, and it *felt*
like exactly the kind of thing that leaks into the server schema and breaks an
INSERT. The cause was named straight from that story — "a server migration (0005)
leaked a mobile-local column into Postgres" — and a fix was designed to match: a
new migration to drop the column. Both the human and the assistant carried this.

Two things were true that no one had checked before naming the cause:

1. **There was no migration 0005 and no such column on the server.** The server
   had only migrations `0001`–`0003`; `grep` for the column across `server/`
   returned nothing; the live Postgres schema (`information_schema`,
   `alembic_version`) held no such column on any table, including `users`. The
   file the fix would have edited did not exist — both parties were about to
   "fix" it anyway.
2. **The real cause was mundane:** the database container (`recycle_pg`) was
   simply DOWN when login ran, so the connection failed and surfaced as a 500 —
   on every request, independent of any column.

The story was wrong, and wrong in the most convincing way: it fit a fear already
held (schema leakage — see [[schema-audit]]) and pattern-matched a lesson already
written. An explanation that fits a fear you already hold is the easiest to
believe and the least checked.

## The rule

Before naming a cause:

- **Reproduce it and read the ACTUAL error** — the real traceback, response body,
  or log line, not a remembered or imagined one. "A 500 on login" is a symptom;
  the stack trace is what says whether it was a dropped DB connection, a bad
  query, or a column.
- **Read the ACTUAL files the story implicates.** If the theory is "migration
  0005 did it," `ls` the migrations and open 0005 *before* proposing to edit it.
  A cause that names a file, column, or migration is checkable in seconds — so
  check it. A fix to a file that does not exist is the tell that no one looked.
- **Only then name the cause, and run its disproof first.** The cheapest question
  is "what single observation would prove this wrong?" — here, `ls versions/` and
  one `information_schema` query, either of which ended the theory instantly.

Confidence — the human's or the assistant's — is not a substitute for looking. An
explanation that arrives before the evidence is a hypothesis wearing a
conclusion's clothes.

## Family

This is the INVERSE of the "a passing result is not evidence" lessons
([[proof-must-run-twice]], [[console-is-not-the-observation]],
[[concurrency-tests-need-a-barrier]]). There, a GREEN result was trusted without
checking what it actually measured. Here, a RED result was trusted to mean what
the story said it meant. Both skip the same step — observing the real thing that
produced the result — in opposite directions. A result, pass or fail, only means
something once you have read what actually produced it.

---

**SOURCE:** `doc-no-is-arrival-order-not-event-time.md`

# doc_no is arrival order; device clocks are wrong. Report on server time.

Two facts observed on a real iPhone against the real server, one hour apart.
They point at the same rule and it is easy to get wrong in opposite directions.

## 1. doc_no reflects when the bill ARRIVED, not when the load was weighed

`doc_no` is assigned by the server, from a locked counter, at the moment the
bill lands. On an offline-first client that is emphatically not the order the
loads were bought:

| doc_no | weighed (device) | arrived (server) |
|---|---|---|
| B-2569-34 | 22:53:38 | 22:55:11 |
| B-2569-33 | **22:54:51** | 22:54:59 |

The load weighed FIRST got the HIGHER number. The mechanism was not a bad sort:
bill 34's first send failed, so its retry backoff pushed `next_attempt_at` about
30 seconds out, and the send queue was filtered by `next_attempt_at <= now`.
Bill 34 was therefore **not in the candidate set at all**, while bill 33 —
weighed 73 seconds later — was immediately sendable and went first.

**A sort cannot order a row the query does not return.** This is the trap: the
obvious fix ("order the queue by weighing time") is correct, necessary, and on
its own would not have changed this outcome by a single number.

### What actually fixes it

Strict head-of-line order over ALL pending bills, backoff included:

- read the pending queue **without** the backoff filter, ordered by
  `device_created_at`;
- only the head may be sent. If the head is in backoff, in flight, or already
  attempted this pass and still pending, the pass **stops** — nothing behind it
  may overtake.

The cost is deliberate and must be understood before copying this: one
unsendable bill holds up every bill behind it. That is the right trade when the
numbers are legal documents. But it CAN practically deadlock — a bill that fails
deterministically retries forever and dams the queue on that device, silently.
Do not "solve" that by skipping the head; the fix is to make the jam visible.
See [[queue-jam-must-be-visible]], which is the sharp edge of this rule.

A successful send additionally clears the stale backoff on every other pending
bill: that send is direct evidence the server is reachable, so the delays behind
it were computed against a world that no longer exists.

### What this still does NOT buy you

Ordering is bounded by the backlog, not by history. A bill held offline
overnight still arrives after today's bills and still takes a later number.
`doc_no` is a gap-free arrival sequence and nothing more. **Never present it as
chronological, sort a report by it, or infer "which came first" from it.**

### The exemption, and its bound

There is exactly ONE deliberate exception to head-of-line ordering, added when
resolvable rejections were split out (see [[unavailable-is-not-rejected]]):

> **Ordering holds within the SENDABLE queue. A bill parked on missing master
> data is exempt from it.**

A bill the server refuses with 424 (no price tier for the seller's grade) leaves
the sendable queue entirely. Bills weighed after it are then sent first, so when
the office adds the price and the parked bill finally syncs, it receives a HIGHER
`doc_no` than loads weighed later.

That is a real weakening and it is accepted, for a reason that has to be stated
rather than assumed: the alternative is keeping it at the head, where one
un-priced product stops the ENTIRE yard from syncing until the office acts. The
exemption trades one bill's number for the whole shop's ability to record sales.

It is not the silent auto-skip [[queue-jam-must-be-visible]] forbids. That
lesson's objection is *"and nobody is told"* — here the bill sits in a named,
operator-visible state carrying the server's own reason code, with an explicit
retry. Visible reordering and silent reordering are different things.

**Hold the bound.** The exemption covers parked bills and nothing else; every
bill that stays in the sendable queue keeps weighing order. If a future change
makes some other bill skippable, that is a new exception needing its own
argument — do not let this one generalise into "ordering is best-effort".

**Where the exemption is proven.** `proveSync.ts` CASE 10b, on both stores,
asserts BOTH halves: the parked bill weighed first takes the highest `doc_no`
(A=3), and the two bills that never left the queue keep their order (B=1 < C=2).
The second assertion is what makes it a bounded exception rather than a general
loss — without it the case would pass just as happily if parking had scrambled
everything.

## 2. The device clock is measurably wrong

Same device, four bills, `server_received_at - device_created_at`:

```
B-2569-27  -3.352s      B-2569-28  -3.109s
B-2569-32  -2.843s      B-2569-35  -2.824s
```

Consistently ~3 seconds AHEAD of the server — and negative, meaning the phone
reports a bill as created *after* the server had already received it. Nothing
was misconfigured; this is an ordinary phone on network time. Skew is not an
edge case to defend against, it is the normal condition.

Hence project hard rule 7 keeping both timestamps, and the rule that follows
from it:

**Every report, every total, every "today's takings", every ordering, and every
date filter keys on `server_received_at`. `device_created_at` is evidence of
what the device believed, useful for ordering our own outbound queue and for
disputes — never an authority on when something happened.**

The failure this prevents is quiet and expensive: a bill weighed at 23:59:58 by
a phone running three seconds fast lands in yesterday's takings on the device
and today's on the server. Two reports, both "correct", that do not reconcile —
and the shop counts a day's cash twice or not at all.

## How to apply

1. Ordering a queue that decides document numbers? Order by the event time AND
   make sure the query returns every candidate. Prove it with a case where the
   older row is deliberately gated — a test where everything is eligible passes
   whether or not the bug is fixed ([[wait-for-the-event-not-the-ticks]],
   [[concurrency-tests-need-a-barrier]]).
2. Any aggregate over time: `server_received_at`. No exceptions.
3. Treat `doc_no` as an identifier, never as a timestamp.

**Where proven.** `mobile/src/proof/proveSync.ts` CASE 8 (a five-bill backlog
weighed out of order drains in weighing order) and CASE 8b, which reproduces the
device sequence exactly and first asserts that the backoff-filtered queue *would*
have offered the newer bill — so the case cannot pass vacuously. The queue lives
in `SqliteLocalStore.listPendingOldestFirst`; the head-of-line rule is in
`SyncEngine.runOnce`.

---

**SOURCE:** `edge-must-reject-what-the-column-rounds.md`

# Postgres ROUNDS to the column scale — so the edge must reject, or you ship a queue jam

**Rule.** Every money/weight field on a request model declares `max_digits` and
`decimal_places` matching its column exactly, plus `ge=0` where the column has a
CHECK. NUMERIC does not reject an over-scale value; it silently rounds it.

## The trap

`NUMERIC(14,2)` does not refuse `1.005`. It stores `1.01`. Verified against the
live database:

```
1.005   -> numeric(14,2) = 1.01
1.0005  -> numeric(14,3) = 1.001     (gross)
0.0004  -> numeric(14,3) = 0.000     (tare)
1.0001  -> numeric(14,3) = 1.000     (net)
```

Each column rounds INDEPENDENTLY. The server's own Python check
`net == gross - tare` passed on those three values — they are exactly consistent
as `Decimal` — and then `ck_items_net` failed on what actually landed, because
`1.000 != 1.001 - 0.000`. Consistency verified before the write does not survive
the write.

## Why this is a queue bug, not a validation bug

The constraint violation surfaced as an **unhandled 500**. And a 500 is
`unavailable` to the client, never `rejected` ([[unavailable-is-not-rejected]]) —
correctly, since the client cannot know whether the server committed. Under
strict head-of-line order that means:

**one malformed line jams that device's entire send queue, permanently, while
staff keep weighing loads into a backlog that will never drain**
([[queue-jam-must-be-visible]]).

So the severity of "we forgot a scale constraint" is not a 500 in a log. It is a
yard that silently stops recording sales. Four payloads did it — a 4dp weight, a
negative weight, a negative price, and a price overflowing the column — and all
four are things a rooted device can send deliberately or a UI change can produce
by accident.

Rejecting at the edge converts each one into a 422: `rejected`, terminal, visible
on the device, and incapable of blocking anything behind it. **The fix is not
"handle the exception" — it is "make it a rejection instead of an unknown".**

## The residue, stated plainly

Declaring scale removes the four KNOWN causes. It does not remove the class: any
future unhandled server error still returns 500 and still jams the head. That is
why the server logs such cases distinctly (`BILL_POISON_CANDIDATE`, with tenant,
bill id and idempotency key) and the device escalates after N consecutive
server-answered refusals. Together they make the jam findable from both ends. A
genuinely poisoned bill still requires a human.

## How to apply

1. For every decimal field on the wire: copy the column's precision and scale
   onto the model. Do not size it to values you expect
   ([[decimal-precision-for-domain-scale]] — the declared column is the bound).
2. Mirror every CHECK you can express (`ge=0`) at the edge too.
3. After adding constraints, re-send the exact payloads that produced 500s and
   assert 422. A 422 is a different OUTCOME CLASS for the client, not a nicer
   status code.
4. Whenever a migration widens a money column, re-derive both this and the
   client's decimal precision.

**Where proven.** `server/app/bills.py` `BillItemIn`/`BillCreate`. All four
payloads returned 500 before and 422 after, each naming the exact field. The
rounding behaviour above was read from the live database, not assumed.

---

**SOURCE:** `fallback-default-is-a-wrong-number.md`

# A fallback default the server will refuse is a wrong number, not a convenience

Applies to every field that DEFAULTS from reference data — prices, tiers, rates,
tax codes, anything the user acts on before the server has agreed.

## What was there

`listPriceFor(product, sellerGrade)` in `mobile/app/api.ts` defaulted the unit
price from the seller's grade tier, and when the seller had **no grade** it fell
back to the first tier present:

```ts
for (const g of ["A", "B", "C", "D"]) {   // "so the field is never blank"
  const p = product.prices[g];
  if (p !== undefined) return p;
}
```

The comment said the point was that the field is never blank. It reads as
defensive. It is the opposite.

## Why it is a money bug

Three facts have to be held at once:

1. **A is the HIGHEST tier.** The fallback always lands on the most expensive
   price the shop offers, for exactly the customers nobody has graded.
2. **The server refuses that bill anyway** — `424 seller_grade_unset`. The
   fallback cannot make the bill valid. It has no upside at all.
3. **The yard pays cash against the number on the screen.** The money leaves the
   till before anyone learns the bill was refused.

So the failure is not "a wrong default gets corrected later". The bill parks,
the office sets the seller's grade to D, the bill then goes through **at the
unit_price already paid**, and the row looks like a deliberate override rather
than a defaulting bug. The overpayment is real, banked, and disguised.

## The rule

> If a default cannot make the operation succeed, it must not be shown as a
> value. Fail BLANK and say why.

`gradePrice()` in `mobile/src/cart/sellers.ts` returns `null` for an unknown
grade or a missing tier, the field stays empty, and the picker marks grade-less
sellers in red before any weight is typed.

Blank is not a worse user experience than wrong — it is the only state that
makes the operator make the decision the system cannot make for them.

## How to spot the next one

Ask of any default: **can the value I am about to invent make this operation
succeed?** If the answer is no — the server will reject it whatever we put there
— then the default is decoration over a failure, and the user will act on it.

This is the client-side twin of [[config-defaults-must-fail-closed]]: there, a
default secret was a default IDENTITY; here, a default price is a default AMOUNT
OF MONEY. Both were introduced to avoid an empty value, and both turned "we do
not know" into a confident wrong answer. See also
[[unavailable-is-not-rejected]] for why the refusal here is 424 (parks, still
owed) and not 422 (terminal) — that classification is what makes fail-blank
survivable instead of stranding a load already tipped onto the pile.

---

**SOURCE:** `login-resolves-under-tenant.md`

# Login resolves the user INSIDE tenant context

**Context.** Usernames are unique only per tenant (`UNIQUE (tenant_id,
username)`); the same username (e.g. `admin`) exists in many tenants. Login
takes a tenant identifier + username + password.

**Rule.** Set tenant context from the submitted tenant id FIRST, then look the
user up under that context, so RLS makes users of other tenants invisible to the
query. A foreign-tenant username simply is not found. Return ONE generic error
("invalid credentials") for both unknown-user and wrong-password, and verify
against a dummy hash when the user is missing so timing does not reveal
existence.

**Why (the failure it prevents).** Looking a user up by username across all
tenants (no context) lets someone authenticate against, or enumerate, another
tenant's account — a cross-tenant login. Distinct error messages or unequal
timing for "no such user" vs "wrong password" leak which usernames exist.

**Where proven.** Phase 1b `server/app/main.py` `login()` and
`server/scripts/prove_auth.py` case 8 (username exists in A; login with B's
tenant id + A's password is rejected) and case 7 (wrong password, same generic
error).

---

**SOURCE:** `metro-file-map-nesting.md`

# When a resolver says a file is missing, ask the resolver — not the OS

**Context.** Phase 2c-1 put the Expo app in `mobile/device/`, its own npm
package nested inside the engine package at `mobile/`, with Metro reaching the
engine through `watchFolders`. Every `../src/...` import failed to resolve. The
files were plainly there.

## The diagnostic that mattered

The instinct is to check the path — retype it, `ls` the directory, adjust
`watchFolders`. That burned two runs and moved nothing. What broke it open was
instrumenting Metro's own resolver and asking **both** layers the same question
about the same absolute path:

```
fs.existsSync(abs)          = true
context.doesFileExist(abs)  = false      <- the answer that mattered
blockList hits              = false,false
```

That single line reclassifies the whole problem. It is not a wrong path, not a
typo, not an exclusion rule — the file was never **indexed into Metro's file
map**. Bundlers, module resolvers, watchers and test runners all resolve against
their own index, not the filesystem. So when one claims a file does not exist,
the useful question is never "is it on disk"; it is "is it in your index, and
why not".

## The ledger, and the wrong cause it saved us from

Four runs, one knob at a time:

| run | watchFolders | node_modules guards | parasitic Expo tree | `../src` |
|-----|--------------|---------------------|---------------------|----------|
| R1  | `../src`     | on                  | present             | FAIL     |
| R2  | `..`         | on                  | present             | FAIL     |
| R3  | `../src`     | on                  | removed             | resolved |
| R4  | `../src`     | **off**             | removed             | FAIL     |

After R3 the conclusion looked obvious and was announced with confidence: a
stray Expo install in the parent's `node_modules` (left by an earlier
`npm install expo-sqlite` used only for typechecking) had been shadowing the
app's dependency tree, and removing it fixed the resolution.

R4 killed that. With the parasite still gone, merely turning off
`disableHierarchicalLookup` + explicit `nodeModulesPaths` broke resolution
again. The differentiator was the node_modules guards; the parasite removal was
a coincidence sitting next to the real variable. **One run would have pinned the
wrong cause**, and the "fix" — deleting a directory — would have appeared to
work while the actual mechanism sat untouched, ready to return.

Nor were the guards a fix: they made `../src` resolve but broke every nested
dependency (`expo-asset` lives at `node_modules/expo/node_modules/expo-asset`).
Neither configuration was viable, which is what forced the real conclusion.

**Rule (method).** Keep a ledger of every run — what changed, what happened —
and require a candidate cause to explain *every* row, not the most recent one.
Change one knob per run. A green run immediately after a change is correlation;
the disproof is what makes it a cause. Same discipline as
[[concurrency-tests-need-a-barrier]] and [[schema-audit]]: a passing result is
not evidence that your explanation is right.

**Rule (structure).** Do not nest one npm package inside another. `mobile/` is
ONE package that *is* the Expo app, with `src/` inside Metro's project root. No
`watchFolders`, no resolver guards, nothing to get subtly wrong. Nesting is what
put the file outside the index in the first place.

## The structural consequence: TS ESM specifiers vs Metro

Collapsing to one package means one `src/` compiled two ways — by `tsc` into
`dist/` for the headless node proofs, and by Metro into the app bundle. Those
two disagree about import specifiers:

- Node's ESM loader **requires** a file extension at runtime, so the source must
  write `import { X } from "./schema.js"` even though the file is `schema.ts`.
  `tsc` understands that convention.
- Metro does not. It fails with `None of these files exist: schema.js(.ts|.tsx|…)`
  while `schema.ts` sits right beside it.

Dropping the extensions is not an option — it breaks `node dist/...`. So
`metro.config.js` retries relative `.js` specifiers without the extension and
lets Metro's normal platform-aware resolution find the `.ts`. Ten lines, and the
comment explains why, because the obvious "cleanup" of deleting it would break
the proofs and not the app — a change that looks safe and passes the app build.

Related: the root `package.json` cannot declare `"type": "module"` (Expo's
`metro.config.js` and `babel.config.js` are CommonJS), so `dist/` gets its own
`package.json` saying `{"type":"module"}` instead.

**Where proven.** Phase 2c-1. `mobile/metro.config.js` carries the shim and the
nesting warning; `mobile/tsconfig.json` and `mobile/tsconfig.node.json` are the
two programs sharing `src/`; `mobile/tools/finish-build.mjs` marks `dist/` as
ESM. Verified by `npx expo export --platform ios` bundling clean and both node
proofs still passing, then by the slice running on a real iPhone.

---

**SOURCE:** `opening-a-copy-is-a-write.md`

# Opening a copy is a write to it

**Applies to** every artefact you copy in order to measure it — a database pulled
off a device, a snapshot taken before and after a change, a control fixture built
to validate a read route — and hardest to SQLite in WAL mode, where the data is
TWO files and only the pair is the data.

**The rule:** a reader can MUTATE the artefact it reads. SQLite checkpoints the
`-wal` into the `.db` and DELETES the `-wal` when the last connection closes, so
the moment you open a copy to check it, the bytes on disk stop being the bytes
you just measured. Every size and hash printed before that open is CORRECT, and
describes a state that no longer exists. **Copy every artefact before opening any
of them, and never open the copy that will be used.**

## Instance 1 — the control that certified a pair and shipped a single file

Building a control to prove a device read-route before trusting it on real data.
One db+wal pair was created with rows committed but deliberately not
checkpointed, so that reading the db WITHOUT its wal would visibly fail — the
negative half that makes the control a control:

    known_pair.db       4096 bytes
    known_pair.db-wal  24752 bytes
    with wal    -> 2 tables, 7 rows and 3 rows      (correct)
    without wal -> NO TABLES AT ALL                 (the mistake, visibly)

Both halves passed, and both numbers were true when printed. The script then
closed, and the *verification itself* — opening the pair to read those numbers —
checkpointed the wal into the db and deleted it. On disk afterwards:

    known_pair.db      12288 bytes
    known_pair.db-wal  ABSENT

**The bytes that would have been pushed to the device were a checkpointed single
file, not the pair the log had just certified.** The control would have been
measuring an artefact nobody had checked, and it would have passed — a
checkpointed database reads correctly. The whole point of the negative half, that
a missing wal fails loudly, could not fire, because the wal was not missing: it
had been absorbed.

Caught by `ls` disagreeing with the script's own output one command later. The
repair is not "check afterwards": it is to take every copy while the writer is
still open, and to keep the copy that will be used SEPARATE from the copy that
gets read.

## Instance 2 — the comparison that could no longer be made

A different pass, two device snapshots taken either side of a sign-out, to
establish whether the sign-out wrote to the local database at all. Both were
pulled correctly, db and wal each:

    signedin.db  98304   signedin.db-wal  41232
    signedout.db 98304   signedout.db-wal 41232

The inspector was then run on the first. That opened it, checkpointed it, and
deleted `signedin.db-wal` — so when the comparison came to run, one side's wal
did not exist and the raw pair could never be compared at all. What survived was
weaker than what had been planned: the pre-open hashes (identical), the wal
SIZES (identical), and the post-recovery content (identical, `ed92840b…`). The
conclusion held, but by a narrower argument than the one designed, and only
because three weaker facts happened to agree.

**Twice, in two separate passes, by two different routes.** The first destroyed a
fixture before it was used; the second destroyed evidence after it was gathered.

## Why nothing catches it

There is no error, no exit code and no red. The reader succeeds, the numbers it
prints are accurate, and `PRAGMA integrity_check` returns `ok` on both the pair
and the checkpointed file — because both are valid databases. The artefact simply
becomes a DIFFERENT valid database between the measurement and its use, and the
only tell is a file listing nobody takes twice.

It is also invisible to the discipline that would normally catch it. Hashing the
artefact does not help if the hash is taken before the open and used after it,
which is the natural order. And "verify the control before trusting it" — the
right instinct, and the one this repository teaches — is the very act that breaks
it.

## What to do

- **Copy every artefact BEFORE opening any of them.** If two snapshots are to be
  compared, both copies exist before either is read.
- **Never open the copy that will be used.** Take a separate copy to read from;
  they are cheap.
- **Where the copies come from a live writer, take them all while that writer is
  still open**, and hash them at that moment.
- **Say WHICH object a number describes** — the raw copy, or the file after WAL
  recovery. They are different bytes with different hashes, and only the first is
  what was on the device. Same discipline `CLAUDE.md § Machine footguns`
  "`core.autocrlf`" demands for blob versus working tree, arriving from the other
  direction: there two objects are confused for one, here one object becomes two
  over time.
- **Read the artefact back after the run, not only before it**, when a fixture is
  going to be handed to something else.

## Why it is a lesson and not a machine footgun

It was first written into `CLAUDE.md`'s footgun section and moved here, by that
section's own test. A footgun is what would cause a WRONG DIAGNOSIS on this
Windows box; this is SQLite's documented close behaviour and would happen on any
machine, in any language, with any reader. `CLAUDE.md § Workflow`
"Two homes, one test" puts it here.

**Sibling of `the-observer-is-a-writer-to-what-it-observes.md`**, separated by
direction. There the instrument writes into the MEDIUM it is measuring — a scan
whose own command lands in the log it greps. Here the instrument rewrites the
ARTEFACT it opens, and the medium is untouched. Both end the same way: a reading
that describes something other than the thing you meant to measure.

---

**SOURCE:** `printed-code-in-a-design-document-is-run-by-nobody.md`

# Printed code in a design document is run by nobody

**Applies** to every code block written into an artefact nothing executes — a
design section, a plan, a phase brief's staging sketch, an example no doctest
runs. The block is written like code and reviewed like prose: no typechecker
reads it, no proof runs it, it has no exit code, and it invites the reader to
execute it in their head, which is how it comes to be reviewed as if it had been
run. A head is not an instrument.

**The rule.** State the DECISIONS, which prose and declarations can carry — the
types, each interface member with its contract, the policy axes and what every
value means, what is shared and what is per-kind, and the dynamic behaviour as
RULES, each paired with the acceptance criterion that turns red when an
implementation breaks it. **Print no statement sequence.** When the mechanism's
shape must exist as code, write it where something runs it — under source,
reached by the typecheckers and the proofs — and let the document point at it.

---

## The measurement — three drafts, two reviews, every defect in the printed block

One design (`ROADMAP.md § P1.18`, stages 2 through 2c, 2026-08-18/19) printed
its drain loop three times. Every defect either independent review found in the
MECHANISM lived in the printed code; none lived in the rules stated as prose
beside it.

- **Draft one** printed a loop that re-selected its batch's first row under
  `while (true)`: it could not advance to a second row, did not terminate for a
  kind whose retries stay owed, and carried a `rereadAfterEach` flag no printed
  line read — a policy member whose every value produced the same loop.
- **Draft two, written to repair draft one by a session holding draft one's
  failure in front of it,** printed a pass lock acquired and released on no
  path, declared a schedule member (`nextAttemptAt`) no printed line called, and
  reported skips through a `noteSkip` with no channel out of the pass.
- **Each block passed the session that wrote it and fell to the next independent
  reader**, one review later. That is the datum: the repair of a printed defect
  arrived carrying three new printed defects, so review does not converge on
  printed code — nothing red-greens it, and each reader starts over with a head
  for an interpreter.

Draft three printed nothing. The loop was replaced by the rule list, the reason
was recorded in the design at the site where the block used to be, and the two
findings the printed code had been hiding from every proof — an unpinned
cross-kind drain order, and a staging the stores cannot represent — were
repaired as a stated rule with a criterion, and a deleted cell with its residue
stated.

## What makes this artefact class exempt from every instrument

Every discipline this repository owns is built on execution: a typecheck's exit
code, a proof run twice, a citation checker's counts, a disproof that must
redden a named cell. A code block in prose is exempt from all of it BY
CONSTRUCTION — there is no artefact to run, so there is nothing for a control to
be about and no state in which anything goes red. The defect is not that a
check was weak; it is that the artefact class admits no check while LOOKING like
the most rigorous part of the page.

Type declarations printed in the same document are the bound, not an exception:
an interface or a union in prose is checked by no compiler either, but it fails
as a CONTRACT — a wrong member list surfaces when the criteria derived from it
are staged — not as a hidden execution. The line is drawn at STATEMENT
SEQUENCES: loops, lock protocols, ordered mutations. Those are exactly what a
reader simulates instead of checks.

## Why no existing lesson reaches it

Sibling of the never-went-red family's two document-borne mechanisms — the pair
found in one Prove: document, named here without that lesson's filename because
an index line carrying it would make every filename-handle citation resolve
twice, which is that file's own eleventh mechanism. Separated by direction:
there a document carried an INSTRUMENT that was never armed, and the remedy is
to read the instrument adversarially before dispatch; here the document printed
the MECHANISM itself, there was never an instrument to arm, and no adversarial
reading converged in two attempts. The docstring lesson is the other neighbour —
prose no instrument reads — but its discriminator asks whether the sentence
could turn false without this file changing, and a printed loop is not a claim
about another file: it is wrong in place, from the moment it is written.

## How to apply

1. **Writing a design: no statement sequence.** Types, contracts, policy values,
   and rules-with-red-cases carry everything a mechanism decision needs.
2. **Reviewing a design: treat any code block as unexecuted by definition**, and
   ask for the rule it encodes and the criterion that reddens when the rule is
   broken. A block you can only check by executing it in your head is the
   finding, before any defect in it is.
3. **When the shape must be shown, put it where something runs it** and point at
   it — the document cites the file; the file gets the typecheckers and the
   proofs.

## Bounds

- The three-drafts measurement is one design in one repository; the mechanism —
  written like code, reviewed like prose, executed by nothing — is structural
  and carries the lesson.
- Nothing here forbids code blocks in artefacts something DOES execute (a proof
  file's source, a script) or quoted OUTPUT kept as evidence, which this
  repository's disproof practice requires.
- No instrument was built and none can be: a fence around "code blocks in
  markdown" would also catch quoted evidence and printed types. This file is
  what stands between the next design and the same result.

---

**SOURCE:** `proof-must-run-twice.md`

# A proof that passes only once proves the environment, not the code

**Rule: every proof script must be runnable twice in a row against a live
database and still pass.** No truncate between runs, no reseed, no dropped
volume. If it needs a fresh database to be green, it is not testing the code —
it is testing that you remembered to wipe the database.

## What happened

`prove_bills.py` was written in Phase 1c and passed. It was run again in Phase
2c-2, untouched, against the same database it had passed on before. It failed.

The observed response was the giveaway:

```
status=200  doc_no=B-2569-1  status_field=voided
```

A `201` was expected. The server had done nothing wrong — it did exactly what
Phase 1c asked it to do. The script hardcoded its idempotency keys
(`bill-A-0001`, `bill-A-conc-1`, ...) and asserted absolute document numbers
(`doc_no == "B-2569-1"`, then `"B-2569-2"`). On the second run those keys
already existed, so the idempotency guarantee correctly returned the *first
run's* bills — which CASE 4 had since voided. Every later assertion then failed
downstream of that, pointing at the wrong thing.

It had passed in Phase 1c for one reason: the tables had just been truncated.

## Why this is worse than a failing test

A test that fails is honest. This one was green while asserting nothing about
the code — its green depended on a manual step outside the script that nobody
recorded and nobody would repeat. Phase 1c shipped believing bills were proven
idempotent under repeat submission. That property *is* true, but the script had
not demonstrated it: it only ever exercised the fresh-key path.

The failure also arrived disguised. The first instinct was that the new Phase
2c-2 seed data had broken it. `git` showed the file unmodified and the seed
untouched by this path; the `200 / voided` response identified the real cause.
Never diagnose from the *newest* change — diagnose from the observed response
([[metro-file-map-nesting]]).

## The fix

Scope every idempotency key to a per-run UUID, and assert `doc_no` **relative**
to wherever the counter currently sits rather than to a fixed number:

```python
RUN = uuid.uuid4().hex[:8]                       # once, at module level
... f"bill-A-{RUN}-0001" ...                     # keys unique per run
check(re.fullmatch(rf"B-{BE_YEAR}-\d+", doc1))   # shape, not value
check(doc_new == f"B-{BE_YEAR}-{seq_of(doc1) + 1}")  # next, not "2"
```

The invariants being proven — gap-free, never reused, monotonic under
concurrency — are all *relative* properties. Asserting them with absolute
numbers was never testing the invariant, only the starting state.

## AMENDED (Phase 2c-6): the seed's SIZE is an environment fact too

The same mistake has a second shape, and a per-run UUID does not catch it.
`prove_master.py` asserted tenant isolation like this:

```python
check("tenant A sees exactly its own seller", len(sa) == 1 and sa[0]["id"] == ...)
```

It was green for a year. Adding four sellers to the dev seed — a change that
touches no isolation logic whatsoever — turned it red. The count was never the
property: **isolation is a set relation**, not a cardinality. The rewrite says
what was actually meant, and is immune to the seed growing again:

```python
check("no seller is visible to BOTH tenants", ids_a.isdisjoint(ids_b))
```

An assertion that breaks when a fixture is *added* was measuring the fixture. Ask
of every count in a proof: if this number changed, would the property I am
claiming actually be false? If not, assert the property.

## AMENDED AGAIN (migration 0004): a fixture a BILL points at can never be cleaned up

The per-run UUID makes fixtures unique. It does not make them *removable*, and
those are different problems.

`prove_master_write.py` creates a product, seller, uom and category per run and
deletes them in its `finally`. One case then wrote an accepted bill against the
run's own product, to show that reactivating it let the bill through. That bill
can never be deleted — hard rule 5 — so `fk_items_product` pinned the product
forever. Three things went wrong at once:

- the `DELETE` raised inside `finally`, so **every restore after it was
  skipped** — including putting a borrowed seeded row back;
- the traceback replaced the summary that would have said so;
- and the run left a live product in the dev picker, which then turned
  `prove_master.py` red for a completely unrelated-looking reason.

Two rules come out of it:

1. **A proof may write a bill against a SEEDED row, or against a row it can
   delete — never both in one fixture.** If a case needs "a bill already
   references this", borrow a seeded row and restore it, the way
   `prove_master_data_gate.py` borrows a price. Retirement (`is_active`) is not
   an escape either: the row still exists and still accumulates.
2. **Every statement in a `finally` must be isolated.** Wrap each cleanup in its
   own `try/except`, record the failure as a named check, and let the rest run.
   A cleanup block that aborts halfway is worse than one that never ran, because
   it leaves the fixture in a state nobody chose and no output explaining it.

The corollary for the count rule above: it bites in **both** directions. The
products assertion in `prove_master.py` was still `len(pa) == 3` after the
sellers one had been fixed — the amendment was applied to the line that failed
rather than to the class. When you fix an assertion of this shape, grep for its
siblings in the same file before moving on.

## AMENDED A THIRD TIME (daily report, 2026-07-29): debris is PERMANENT, so a count assertion has a half-life

The previous amendment ended with "grep for its siblings in the same file before
moving on." That was done for `prove_master.py` and **not** for
`prove_master_write.py`, which carried this in its own retirement case:

```python
check("...everything else is still there",
      len(default_list) > 0 and len(with_inactive) == len(default_list) + 1)
```

It went red while proving the daily report — on a run that changed nothing in
that path. The cause was a bill from the day before, `mw-f0c445f2-inactive`,
written against that run's OWN seller and product: exactly the trap rule 1 above
names. Hard rule 5 pins the bill, the FKs pin the seller and product, its cleanup
could not remove them, and they sit in the tenant retired and immortal. So there
were now TWO inactive products, and `+ 1` was false.

The retirement worked perfectly. The assertion was counting.

**The new part is the time axis.** The earlier amendments ask "would this break
if a fixture were added?" — a question about the seed, which someone chooses to
change. This one breaks with no change at all, because on any table that cannot
be hard-deleted, leftover rows only ever accumulate. A count assertion over such
a table is not merely fragile; it has a **half-life**. It is not a question of
whether it goes red, only of which unrelated phase is holding it when it does —
and the cost is paid by whoever is debugging something else that day.

The fix is the set difference the check was always trying to state, which needs
the before-set observed:

```python
offered_before = {p["id"] for p in get("/products")}     # BEFORE the deactivate
...
check(offered_before - offered_after == {this_run_product}
      and offered_after and offered_after < with_inactive_ids)
```

And the corollary widens: **grep every proof script for this shape, not just the
file that went red.** `len(x) == n`, `len(a) == len(b) + 1`, and any arithmetic
between two counts of live data are all the same defect wearing different
clothes.

## AMENDED A FOURTH TIME (reconciliation, 2026-08-02): a proof that NORMALISES its own fixture measures its last run

`prove_reconcile.py` breaks each money invariant on purpose in a restored copy.
The live database is not clean — it carries 84 violations, all proof debris — so
the harness first UNDOES the two known causes in the copy, and asserts the copy
then runs green. That assertion is the whole proof of the diagnosis: if those two
causes did not account for all 84, something else does and must be found.

Run 1 was honest. **Run 2 printed this:**

```
  the copy as restored : exit 0, 0 violations {}
  cause 1, prove_rls direct inserts : DELETE 0, DELETE 0
  cause 2, prove_daily_report fixture day : UPDATE 0
  [OK  ] the two known causes account for ALL of the live violations
```

Zero rows deleted, zero updated, and a green tick under it. The copy was still
normalised **from the previous run**, so "before" was already clean and the check
confirmed nothing. Every earlier amendment here is about a proof whose second run
FAILS; this is the other half — a proof whose second run PASSES, for a reason
that has nothing to do with the claim.

The distinguishing feature is that this script mutates its own fixture as a
*setup step* rather than as the thing under test. A per-run UUID cannot help: the
fixture is the whole database.

Two rules:

1. **A proof that mutates its fixture must CREATE that fixture**, not find it.
   `prove_reconcile.py` now runs `restore_db.py` itself, so every run starts from
   the same dump and the "before" state is a fact rather than a hope.
2. **Where a claim needs a precondition, ASSERT the precondition, and SKIP rather
   than pass when it is absent.** The diagnosis check now requires that the copy
   arrived dirty; given a clean one it prints `[SKIP]` and says a fresh restore is
   needed. A check that cannot be made must never be reported as a check that
   passed — the same distinction the checker itself draws between exit 1 (the
   money is wrong) and exit 2 (nobody looked).

See [[a-checker-must-not-share-the-code-it-checks]] for the injection discipline
this sits inside: fires / names the row / **clears again when undone**.

## AMENDED A FIFTH TIME (the rebuild, 2026-08-03): a count the ENVIRONMENT owns expires when the environment is rebuilt

The fourth amendment above was written on 2026-08-02, about `prove_reconcile.py`.
The next day the database was rebuilt and that same file went red. It has been
red ever since, and nothing in R1 or R2 touched it.

Three of its expectations are absolute counts of a database that no longer
exists:

```python
prove_reconcile.py:634   expect={"S3": 1, "B1": 1, "B2": 1, "T0": 91}
prove_reconcile.py:636   "table=tenants  rows_visible_with_no_tenant_context=46"
prove_reconcile.py:718   "table=tenants  rows_at_start=46  rows_at_end=47"
```

They were written against a 46-tenant database. The rebuild took it to 2.

**Measured either side of migration 0005, not inferred** — it fails from a
pre-0005 dump (48 tenants, `T0` got 95), from a second pre-0005 dump (3 tenants,
`T0` got 3), and identically from a post-0005 dump. The same four failures
throughout, so `token_version` is not involved. **Every injection that is about
MONEY still passes.** Only the two tenant-count assertions and the X3 timing
probe fail: what decayed is the proof's expectations about its own fixture, not
the checker's ability to see a money defect.

**The new axis is WHO OWNS the number.** The third amendment's half-life is about
accumulation — debris piles up, so the count drifts on its own with nobody
touching anything. This one does not drift. It was correct on 2026-08-02 and
wrong on 2026-08-03, because somebody legitimately rebuilt the world. Restoring a
dump, reseeding, standing up a fresh tenant, migrating a customer: none of these
are things a proof gets to forbid, and all of them expire a count of rows the
proof did not create. **If the proof did not put the row there, it may not assert
how many there are.** Derive the number from the restored copy at runtime, or
assert a relation the count cannot carry.

**The part worth staring at: this is the fifth bite, in the very file the fourth
amendment was written about.** The second amendment already said "grep for its
siblings in the same file before moving on"; the third widened it to "grep every
proof script for this shape, not just the file that went red." Both were
addressed to exactly this. On 2026-08-02 the sweep would have found `:634`,
`:636` and `:718` while the file was still green — one day before the rebuild
expired them. The rule was written INTO this file and not applied TO it, by the
session that wrote it.

So the sweep is not a step in fixing the assertion that went red. It is a step in
fixing the assertion that went red, run against every file you touched that day,
INCLUDING the one you were editing. A lesson applied only to the case that
prompted it is the defect the lesson describes, one level up.

Recorded in `OPEN_ITEMS.md:179-200` and in `PROJECT_STATUS.md:1603-1620`, which
carries the fuller measurement. Not fixed there or here: deciding what those
numbers derive FROM is a change to a destructive proof, and not one to make in
passing.

## How to apply

Before trusting any proof script:

1. Run it twice in a row without touching the database. If run 2 fails, the
   script is wrong, not the run.
2. Grep it for hardcoded unique keys and absolute expected values. Any
   idempotency key, external reference, or generated number must be per-run.
3. Assert the shape and the *delta*, not the value, for anything the server
   assigns.
4. Grep it for `len(...) == <n>` on seeded data. Rewrite as a membership or
   disjointness claim unless the exact count really is the invariant — and fix
   every one you find, not only the one that went red.
5. Check what the script leaves behind, by querying for its run tag after it
   exits. "It passed" and "it cleaned up" are separate claims, and the second
   one needs its own assertion in the script.
6. Ask of every count that survives step 4: did this script CREATE the rows it
   counts? If not, the number belongs to the environment, and a restore, a
   reseed or a new tenant expires it. Derive it from the fixture at runtime, or
   assert a relation that does not carry a count.

This sits alongside the other lessons about a green result that proves nothing:
[[concurrency-tests-need-a-barrier]] (workers that never overlapped),
[[schema-audit]] (proofs pass while the schema is wrong), and
[[metro-file-map-nesting]] (one green run pinned the wrong cause). The common
shape: **a passing result is only evidence if you know what would have made it
fail.** Here, nothing would have — on a fresh database it could not fail, and
on a used one it could not pass.

---

**SOURCE:** `queue-jam-must-be-visible.md`

# A strict ordered queue CAN deadlock. Don't skip the head — make the jam visible.

Phase 2c-3/5.1 built a strict head-of-line send queue: only the oldest pending
bill is ever sent, nothing behind it may overtake, so document numbers follow
weighing order (see [[doc-no-is-arrival-order-not-event-time]]). While building
it I wrote, in a code comment AND in a lesson, that this "cannot deadlock." That
was wrong, and it was the confident-wrong kind that hides a real bug.

## The failure

A bill can make the server fail **deterministically** — a 5xx on that specific
payload every time. Per [[unavailable-is-not-rejected]] a 5xx is `unavailable`,
not `rejected`: the client cannot know the server will never accept it, so it
retries **forever** under a capped backoff. That is correct in isolation. Under
strict head-of-line order it is a trap: the poisoned bill sits at the head and
**dams every bill behind it, forever, on that one device, silently** — while
staff keep weighing loads and saving bills into the growing backlog, seeing
nothing wrong. A practical deadlock, even though no lock is held.

"It retries forever so it can't deadlock" reasons about the ONE bill. The
deadlock is about **everything behind it**.

## The fix that is NOT the fix

Auto-skipping the stuck head so the queue drains. It trades a visible problem
for a silent one: the document numbers now come out in the wrong order and
nobody is told. For legal-document numbering that is **worse** than the jam. The
ordering guarantee is the whole point; do not quietly break it to relieve a
symptom.

## The fix

Keep the ordering. Make the jam **loud** — but only the RIGHT jam.

- Record when the head **first** failed (`first_attempt_at`, stamped once with
  `COALESCE`, never moved — a `next_attempt_at` that slides forward each backoff
  cannot measure "how long has this been stuck"). This is the total-stuck clock.
- Assess the queue with a pure function (`sync/queueHealth.ts`): the head is
  blocking when it has actually bounced (`attempts > 0`) **and** bills wait
  behind it.
- **Distinguish an offline backlog from a poisoned head — they are not the same
  alarm.** A yard that has simply lost signal piles up a backlog too, and it must
  stay CALM AMBER however long that lasts, or the alarm cries wolf on every dead
  spot and the operator learns to ignore the strip. Only a bill the REACHABLE
  server keeps refusing is a fault to escalate (red, "call support").
- Surface it where it cannot be missed: the always-visible status strip says, in
  plain Thai, that one bill is stuck and is holding up N behind it; the bill list
  marks which bill is the blocker. Visible without opening anything.

The signal that separates offline from poisoned is **not** time and **not**
attempt count — a long outage and a poison pill both bounce many times over many
minutes, so any threshold on elapsed time *alone* flags the honest outage too.
The reliable signal is whether the **server answered**: a bounce carrying an HTTP
status (a 5xx) proves the network is usable and the server still refused
(poison); a transport-level bounce (timeout, no route, no token) proves nothing
got through (offline). Capture it at the source — `SendOutcome.reachable`, set by
the transport where the truth is known, never by string-matching an error message
later — and carry it as `first_server_error_at`: stamped while the reachable
server is refusing, RESET to null the moment a bounce is transport-level. Non-null
then means exactly "the reachable server has been refusing this bill continuously
since this instant", which is both the poison fact and its duration in one field.

So there are TWO knobs, both guesses to tune against a real yard's network: the
reachability signal above, and `POISON_ALARM_MS` — how long the reachable refusal
must persist before red, measured from `first_server_error_at` so time merely
spent offline never counts toward it. The offline/amber state has no timer at all;
it is honest for as long as the network is down.

## Amendment: a COUNT may escalate, but must never classify

Read this before concluding the code contradicts the paragraph above.

`assessQueue` now raises the red alarm on EITHER of two triggers: the refusal has
persisted past `POISON_ALARM_MS`, **or** the reachable server has refused the head
`POISON_ALARM_ATTEMPTS` times in a row. That is not a reversal of "not attempt
count", because the two statements are about different questions:

- **Classifying** a jam as offline vs poisoned — still decided SOLELY by whether
  the server answered. Unchanged, and it is what the paragraph above is about.
- **Escalating** a head that is ALREADY classified poisoned — may use a count.

The clock alone assumed a poisoned bill takes time to become obvious. That holds
only while the backoff is short: a fast-answering server, a device retrying since
before a restart, or a backoff already at its cap can burn through many refusals
inside one threshold window. Each of those refusals is direct evidence the bill
will not go, so waiting out a timer while holding five of them is simply a later
alarm.

**The property that makes the count safe is that it RESETS.**
`server_error_attempts` is incremented only on a server-answered bounce and set
back to 0 by any transport-level one, exactly like `first_server_error_at`. An
offline yard therefore cannot accumulate it, however long it is down. Using
`attempt_count` instead would reintroduce precisely the cry-wolf failure this
lesson warns about: it counts every attempt of any kind and never resets, so a
device that spent a night offline would arrive at morning with a large count, no
server error at all, and a red alarm.

If you ever move this counter, keep the reset. The reset is the lesson.

**Where the amendment is proven.** `proveSync.ts` CASE 9d, on both stores: the
alarm fires at 30s elapsed against a 90s clock threshold (so it was the count, not
the clock), the head is still never skipped, and — the disproof — an OFFLINE head
bounced 10 times with `serverErrorAttempts` still 0 and stayed calm amber.

## How to apply

1. Any strict in-order queue with no-give-up retry can deadlock behind a
   deterministically failing item. Assume it will, and design the *visibility*,
   not just the retry.
2. Never relieve a head-of-line jam by reordering or dropping the head unless
   losing order is acceptable — here it is not.
3. "Retries forever" is a property of one item; a queue's health is about what
   is stuck behind it. Measure and show that.
4. A stalled retry queue can be OFFLINE or POISONED, and staff respond to them
   differently (wait it out vs call support), so the UI must tell them apart. Do
   it on whether the server ANSWERED — an HTTP status came back — captured at the
   transport, never on elapsed time or attempt count, which cannot separate a
   long outage from a poison pill.

**Where proven.** `mobile/src/proof/proveSync.ts` CASE 9, in three parts on both
stores. 9a: an OFFLINE backlog driven PAST the threshold stays amber — stuck for
longer than `POISON_ALARM_MS`, yet `alarm=false` and `poisonedForMs=0`. 9b: a
POISONED head (a reachable 5xx every time) with three bills behind it goes red
once it persists, reporting blocker id, count behind and elapsed, and the alarm
is held off below the threshold so the case is not vacuous. 9c: the two are
asserted DISTINGUISHABLE, and that it is the reachable-server signal, not the
clock, that separates them — both waited past the threshold, only the
reachable-refusal one went red. Then the server recovers and the backlog drains
in weighing order, proving the poisoned queue was jammed, not dead.

---

**SOURCE:** `render-in-shop-time-not-device-time.md`

# Store UTC, render in the SHOP's timezone — and never slice an ISO string

**Rule.** Timestamps are stored as UTC instants. Exactly ONE module per side
turns an instant into something a human reads, and it converts to the SHOP's
timezone. Nothing else may format a timestamp — no `getHours()`, no
`toLocaleString()`, and above all no slicing the ISO string.

## What happened

The bill list showed a load weighed 15:16 in Bangkok as **08:16**. Exactly seven
hours — the UTC offset.

```tsx
{b.created_at.slice(0, 10)} {b.created_at.slice(11, 16)}   // BillsPanel
```

`created_at` is `toISOString()` output, so characters 11–15 are the **UTC** clock.
The slice never parses a date and never converts anything; it prints UTC verbatim.

Storage was innocent, and checking that first is what kept the fix in the right
layer: Postgres held `timestamptz` with `tzinfo=UTC`, SQLite held
`"2026-07-26T11:00:18.672Z"` (TEXT, explicit `Z`) written on a device whose local
clock read 18:00. Both correct.

## The rival explanation, and how it was killed

"The phone's timezone is set to UTC" fits the symptom just as neatly, and would
have sent the fix to the wrong place entirely. The disproof was one experiment —
run the formatter under two process timezones:

| device TZ | bill list (slice) | status strip (`getHours`) |
|---|---|---|
| `Asia/Bangkok` | **11:00** | 18:00 ✓ |
| `UTC` | **11:00** | 11:00 |

The bill list prints the same value under both, because a string slice cannot
consult a timezone. Device configuration could not have caused it and could not
have fixed it. The status strip is the control: it *was* correct on a properly
set phone, which is why only one screen was reported.

## Why the SHOP's zone and not the device's

A business day belongs to the shop, not to whichever handset is in someone's
pocket. Device-local formatting means a phone on the wrong timezone, or carried
across a border, silently relabels which day a load was bought on — and SRS 3.3
daily totals then differ depending on who opens the screen. `getHours()` is not
"the safe option"; it is a different wrong answer that merely happens to be right
while the phone is configured correctly.

## The same bug bites dates, not just clocks

A UTC-derived DATE is wrong for a whole slice of every day. In Bangkok
(UTC+7) anything between **00:00 and 06:59** local is still yesterday in UTC:

```
weighed 2026-07-27 00:30 Bangkok -> stored 2026-07-26T17:30Z -> displayed 2026-07-26
```

Server-side this reached `doc_no`. `be_year` came from
`datetime.now(tz=timezone.utc).year`, so a bill arriving 2027-01-01 00:30 in
Bangkok took **be_year 2569 instead of 2570** — and because `doc_no_counters` is
keyed on `(tenant_id, be_year)`, it would also have continued the previous year's
sequence, so the new year would not restart at 1 and two business years would
share a counter. On legal document numbering.

## Two constraints found while fixing it — verify, don't assume

- **Python `zoneinfo` cannot resolve `Asia/Bangkok` on Windows.** No IANA
  database ships with Windows and `tzdata` was not installed:
  `ZoneInfoNotFoundError`. A named fixed offset
  (`timezone(timedelta(hours=7), "Asia/Bangkok")`) avoids the dependency.
- **Hermes `Intl` with a `timeZone` option is UNVERIFIED on a device.** If it were
  silently ignored, the display would fall straight back to UTC — the exact bug
  being fixed, reintroduced invisibly. Same reasoning as
  `ids.ts` choosing `expo-crypto` over an unchecked global.

Both are why the shop zone is a fixed offset today. That is only sound because
**Thailand has observed UTC+7 with no daylight saving since 1920**. A per-tenant
timezone WILL include zones with DST, and a fixed offset cannot express those —
that migration must move to real IANA handling and be verified on a device.

## How to apply

1. Store instants (UTC). Never store or compare a formatted local string.
2. One formatter per side, one timezone constant per side, and a comment
   forbidding every other path. Two formatters is two behaviours
   ([[unavailable-is-not-rejected]] is the same shape: make the type system or
   the module boundary carry the rule, not someone's memory).
3. Any DATE derived for business meaning — report boundaries, document-number
   years, "today's takings" — converts to shop time FIRST. Aggregates still key
   on `server_received_at` ([[doc-no-is-arrival-order-not-event-time]]); this is
   about which day that instant falls in.
4. When a display looks time-shifted, check STORAGE before blaming the renderer,
   and check whether the suspect path can even see a timezone before blaming
   configuration ([[diagnosis-must-precede-the-fix]]).

**Where proven.** `mobile/src/proof/proveTime.ts` — the three reported instants,
the 00:30 / 06:59 / 07:00 / 23:59 boundary, the new-year case, and a placeholder
for unparseable input. It is run TWICE, under `TZ=Asia/Bangkok` and `TZ=UTC`, and
must produce identical output; a device-dependent helper passes one and fails the
other. Server side, `server/scripts/prove_shop_time.py` proves `_be_year` across
the new-year window INCLUDING the disproof that the old UTC expression really
answered 2569, then proves over real HTTP that the value reaches both `doc_no`
and the `doc_no_counters` key.

**DONE since:** `shopDate()` now returns พ.ศ. (`26/07/2569`) — see
[[be-year-comes-after-the-timezone]]. Splitting it out was the right call: the
`+543` has to land *after* the conversion this lesson is about, and separating
the two passes is what made the ordering provable instead of entangled. A wrong
year and a wrong offset still look identical in a screenshot.

**Still outstanding:** the desktop thermal slip. `desktop/` is empty, so no
printed slip exists yet, but CLAUDE.md requires พ.ศ. there too and a slip is what
the seller keeps. It is the next consumer of this module and must port the module,
not re-implement the formatting — a second `+543` in Electron is a second
behaviour, and the two would drift at exactly the boundary neither author tested.

## Amendment (2d): the wire's precision is not the language's parse contract

Everything above is about WHICH clock. This is about whether the string parses at
all, and it was found the first time a SERVER-produced instant reached a screen.

`GET /reports/daily` returns Postgres `timestamptz`, so `reports._shop_iso` emits
**six** fractional digits: `2026-08-01T17:32:11.123456+07:00`. The ECMAScript Date
Time String Format specifies **exactly three**. More than three is
implementation-defined — V8 truncates and is happy; **Hermes is unverified**, in
the same family as `Intl` with a `timeZone` option, `atob` and
`crypto.randomUUID` (PROJECT_STATUS "Known device gaps").

Nothing had met this before because every instant the app had ever rendered came
from `new Date().toISOString()` **on the device**, which is always exactly three
digits. The client's own output had been silently defining the input contract.

If Hermes returns `NaN` there, `shopWallClock` returns null and every timestamp on
the report renders as `—`. That fails visibly rather than wrongly, which is the
good direction — but it fails on the device only, on a screen the owner opens at
closing time, and it would look like the endpoint was broken.

So `shopWallClock` now trims sub-millisecond digits before parsing. Truncation,
never rounding: rounding `.999999` up carries into the next second, and
sub-millisecond precision means nothing on a screen showing `HH:MM`.

**Two rules out of it, and the second is the general one:**

1. An instant carrying its own offset (`…+07:00`) needs no special case here —
   the offset is part of the instant, so the parse yields the same moment and the
   shift still puts it on the shop's clock. Nothing in the module reads the
   string's offset, which is exactly why a server changing its output offset
   cannot move what this prints.
2. **Never let one side's output define the other side's input contract.** Both
   ends were "ISO-8601" and both were telling the truth; the format is a family,
   and the members differ in precision, offset form and separator. When a new
   producer starts feeding an existing parser, check the parser's actual spec —
   not the fact that it has been working.

This matters most for the consumer that does not exist yet. The desktop thermal
slip must PORT this module, and the trim will look like a line worth deleting.
It is not: the slip is the artifact the seller keeps, and `—` where the time
should be is printed on paper.

---

**SOURCE:** `revoke-in-migration.md`

# Privilege changes live in the migration, not in a live one-off

**Context.** During Phase 1a a blanket `GRANT ... ON ALL TABLES` accidentally
also granted the app role access to Alembic's `alembic_version` table; it had
to be taken back with a `REVOKE`.

**Rule.** Any GRANT/REVOKE or permission change must be written INTO the
migration, so every database — including a brand-new customer's — reaches the
same privilege state by replaying migrations. Never fix privileges by running a
statement against one live database once.

**Why (the failure it prevents).** A REVOKE (or GRANT) applied only to the
current dev DB is invisible to `alembic upgrade`. The next fresh database
provisioned for a new customer silently skips it and reopens the exact hole you
thought you closed — with no diff to notice, because the migration files never
changed.

**Where proven.** Phase 1a migration `0001_initial_schema.py` (the
`REVOKE ALL ON alembic_version FROM recycle_app` lives in the migration; the DB
was rebuilt from scratch with `docker compose down -v` + `alembic upgrade head`
to prove the revoke is produced by replay, not by a live patch).

---

**SOURCE:** `schema-audit.md`

# Audit a migration field-by-field against the agreed schema before commit

**Context.** Migration 0001 quietly added several columns that were never in the
agreed schema. Most were harmless (`created_at`, `full_name`, `phone`), but one —
`grade` — landed on the WRONG table (`purchase_bill_items`). Line items do not
carry a grade; per SRS 1.6 the seller does. Every proof still passed the whole
time, because the extra column simply sat there unused.

**Rule.** Before committing any migration, read it column-by-column, constraint-
by-constraint, table-by-table against the agreed schema (the spec / SRS / the
fields explicitly listed for the phase). Every addition must trace to a
requirement or an agreed rule. Anything that doesn't is either removed or
explicitly justified out loud. Passing proofs is NOT sufficient evidence that
the schema is correct.

**Why (the failure it prevents).** Green tests only show that what the code
exercises works; they say nothing about columns nothing reads yet. An unused
column on the wrong table becomes load-bearing the moment later code trusts it,
and by then it is in production data and expensive to move. Schema drift is
silent precisely because it doesn't break anything — until it does.

**Where proven.** Phase 1c review: the human audit (not the test suite) caught
`grade` on `purchase_bill_items`; migration `0003_move_grade_to_sellers.py` drops
it there and adds it to `sellers`. All proofs had been green with the column
misplaced.

---

**SOURCE:** `set-local-per-request.md`

# Tenant context = SET LOCAL, per request, fail closed

**Context.** Multi-tenant isolation is enforced by Postgres RLS keyed on the
GUC `app.tenant_id`. Something has to set that GUC for each unit of work.

**Rule.** Set it with `SET LOCAL app.tenant_id = <tenant>` (i.e.
`set_config('app.tenant_id', tid, true)`) INSIDE the transaction that does the
work. Never a session-level `SET`. If a request has no valid tenant, run with
NO context set — the RLS policy reads
`NULLIF(current_setting('app.tenant_id', true), '')::uuid`, so unset matches
nothing and the request sees zero rows. There is no "unset means all tenants"
path, ever.

**What the rule does NOT cover, and that is a boundary rather than a defect.**
The GUC is set by the application role for ITSELF, so this covers a handler that
forgets a filter COMPLETELY, and it is NOT a defence against anything able to
execute SQL as that role — such a thing can set the GUC to another shop's id and
read that shop's rows, one tenant at a time. MEASURED on the live cluster: one
`recycle_app` connection returned 376 bills for tenant A and 9 for tenant B,
changing only `app.tenant_id`; with no context set it returned 0. Two controls on
that same connection were REFUSED — `SET log_min_messages` and
`SET session_replication_role` both raised `permission denied to set parameter` —
so this is a property of that one parameter and not of the role being able to set
anything it likes. What covers SQL execution is parameterised queries, not RLS.
Write the rule down with its boundary: a guarantee stated without its scope gets
read as covering the case it does not.

**Why (the failure it prevents).** A session-level SET survives on the pooled
connection after the request ends; the next request — possibly another tenant —
inherits the stale context and reads/writes the wrong tenant's data. In a
real-money system that is a cross-tenant breach. A "default to all if unset"
fallback is the same breach by omission.

**Where proven.** Phase 1a `server/scripts/prove_rls.py` (step 6 first FAILED
with a session-level SET leaking across the pool, then passed once switched to
SET LOCAL). Phase 1b `server/app/db.py` `tenant_connection()` and
`server/scripts/prove_auth.py` (whoami reads back `current_setting` per request).

---

**SOURCE:** `sqlite-busy-timeout-first.md`

# PRAGMA busy_timeout must be the FIRST statement on a SQLite connection

**Context.** Opening a SQLite connection normally means running a few setup
pragmas — `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout`. The order
looks like a matter of taste. It is not.

**Rule.** `PRAGMA busy_timeout` goes first, before every other statement,
including `journal_mode`. Only then does the connection have permission to wait
for a lock.

**Why (the failure it prevents).** A connection's default busy timeout is 0: it
does not wait at all, it fails immediately with SQLITE_BUSY. Every statement
after opening can need a lock — and the `journal_mode = WAL` switch itself needs
one, because it may have to recover the WAL left by another connection. With
`busy_timeout` set *after* it, that switch runs with zero patience and throws
"database is locked" (errcode 261, SQLITE_BUSY_RECOVERY) whenever another
connection is active. It is intermittent, which is worse: on a device it looks
like a random unexplained crash on app start, most likely when a previous run
did not shut down cleanly — exactly when the user's unsynced bills are at stake.

**Where proven.** Phase 2b, empirically: with `journal_mode` before
`busy_timeout`, a 4-thread claim probe threw "database is locked" on 2 of 3
runs; with the order corrected, 5 of 5 runs passed and no run has failed since.
The shipped order lives in `mobile/src/adapters/sqlite/schema.ts`
(`CONNECTION_PRAGMAS`).

---

**SOURCE:** `sqlite-money-is-text.md`

# In SQLite, money columns are TEXT — and STRICT will not save you

**Context.** Postgres has NUMERIC; SQLite does not. It has column *affinity*,
which converts values silently on the way in. The mobile local store holds the
same money and weight values the server stores as NUMERIC.

**Rule.** Every amount and weight is stored as a decimal STRING in a column with
TEXT (or BLOB) affinity — in this project, inside `payload_json TEXT`. Never
declare a money or weight column NUMERIC, DECIMAL, or REAL in SQLite, however
much it looks like the Postgres schema it mirrors.

**Why (the failure it prevents).** Verified, not assumed:

- Binding the string `"10.500"` to a **NUMERIC** column stores the float `10.5`,
  with `typeof()` reporting `real`. The trailing digit is gone and the value is
  now IEEE-754. `SELECT 0.1 + 0.2` in the same SQLite returns
  `0.30000000000000004`.
- A **STRICT** table does *not* protect against this. STRICT rejects text in an
  INTEGER column, but a TEXT column silently **accepts** a bound number and
  stringifies it: `0.3` is stored as `"0.3"` and the integer `5` is stored as
  `"5.0"`. A JS float reaching that bind would be written as its full decimal
  expansion, with no error anywhere.

So the database will not catch this class of bug. The guarantee has to live
upstream: `BillPayload` declares every amount and weight as `string`, the client
performs no arithmetic on them, and the store only ever binds the output of
`JSON.stringify`. TypeScript is the enforcement; SQLite is not.

**Where proven.** `mobile/src/proof/sqliteProof.ts` S1 (affinity conversion,
float drift, and the STRICT behaviour, all asserted against real SQLite 3.50.4)
and S2 (`"0.3" "0.1" "0.2" "0.10" "10.500" "0.30"` round-trip byte-identical
through a real file). Project hard rule 1.

---

**SOURCE:** `sync-state-needs-startup-recovery.md`

# An in-progress state that nothing polls strands records forever

**Context.** The mobile sync engine moves a bill `pending -> syncing -> synced`.
The sender only ever looks for `pending` rows — that is what makes the in-flight
guard work, because a claimed bill disappears from every other runner's queue.
The consequence is that `syncing` is a state NO query returns. If the process
dies between the claim and the outcome, the bill sits in `syncing` and is never
looked at again: not by the next sync run, not by the next app launch, never.
The bill is saved locally, the user believes it is safe, and it silently never
reaches the server.

**Rule.** Any state that means "work in progress" must have an explicit startup
sweep that resolves it before the first work pass runs. Reset it to the
retryable state and record why. Never rely on the normal work loop to notice —
by construction, the normal loop cannot see it. Assert this in the proof by
checking that the stranded record is invisible to the sender BEFORE recovery
runs, not only that recovery works.

**Why (the failure it prevents).** Silent permanent loss of a real-money bill,
with the local record cheerfully claiming everything is fine. It is invisible in
testing because the strand requires a crash inside a narrow window, and it is
invisible in production because nothing ever queries the state that holds it.

**Corollary that made recovery cheap.** Recovery does not need to ask the server
whether the bill landed. Re-sending carries the same, never-regenerated
`idempotency_key`, so the server resolves the ambiguity itself — a repeated key
returns the existing bill instead of creating a second one (proven server-side
in Phase 1c, see [[login-resolves-under-tenant]] for the same
"let the lower layer enforce it" pattern). That turns distributed reconciliation
into a plain local state reset. It only works because the key is generated ONCE
at bill creation; regenerate it on retry and every recovery becomes a duplicate.

**Where proven.** `mobile/src/proof/proveSync.ts` CASE 4: the bill is forced to
`syncing`, the store is re-created to model a restart, and the proof asserts
`listReadyToSend` returns nothing — the bill really is unreachable — before
`recoverInterrupted()` returns it to `pending` and it syncs. CASE 3 proves the
same-key retry after a lost response yields exactly one bill on the server.

---

**SOURCE:** `the-observer-is-a-writer-to-what-it-observes.md`

# The observer is a writer to what it observes

**Applies to** every scan, count, grep or log read whose result you are about to
cite as evidence — hardest when the medium is one your own tooling touches, and
hardest of all when you are checking for contamination, because that check is
itself an action.

**The rule:** a reading is not evidence until you have asked who wrote to the
medium, whether your own query is one of those writes, and whether the corrected
number is even inside the domain a count can occupy. All three, at one moment,
before the number is believed.

**THREE MECHANISMS, and this line is the only place in this file that says how
many.** Every heading below names its own mechanism and never the running total,
so appending a fourth is a one-number edit, here. That convention is not
decoration: [[a-check-that-never-went-red-was-never-observed]] carried its count
in three headings and an index line, all four went stale while the body grew
from four mechanisms to nine, and the index line ended up reading "Six
mechanisms" and "a NINTH mechanism" in one sentence.

Sibling of [[a-check-that-never-went-red-was-never-observed]], and the boundary
between them is the direction of causation. That file is about an instrument
that fails to REACH the medium — an empty needle, an unopened artifact, a
haystack the system returned empty. This one is about an instrument that is
INSIDE it.

## Mechanism 1 — the scan read its own command

A probe captured every PreToolUse hook payload verbatim to disk. A later scan
searched the captured set for the string `model` and found exactly one
occurrence: its own command, captured as a payload while it ran.

The capture excludes nothing. Its whole design is to be complete —

    raw = sys.stdin.buffer.read()
    fn  = "payload_%d_%d.json" % (time.time_ns(), os.getpid())

— and completeness is precisely the property that puts the observer in the data.
The scanning script filtered by filename fragment only; nothing anywhere
excluded the record of the invocation doing the reading.

**The number the incident was first reported with was also wrong**, in a way
worth keeping: it was described as "the only occurrence across 136 payloads",
and the directory held 206 files when it was checked. The capture had kept
running after the reading was taken. A set that grows while you cite its size is
the same defect one layer up.

**The remedy is to exclude your own record BY IDENTITY** — this path, this pid,
this timestamp. Not by content. Dropping every payload whose command contains
`model` would also delete a genuine `model` field carried in a payload that
happens to mention it, which is mechanism 3 arriving as the fix for mechanism 1.

## Mechanism 2 — a third party wrote your action into the medium

Two PreToolUse gates in this repo record every shell command they see, verbatim,
into a log inside the working tree:

- `.claude/settings.json` registers both under `"matcher": "*"`
- `.claude/hooks/pipe_gate.py:237` writes the ALLOW line
- `.claude/hooks/commit_gate.py:199` writes its own
- `.claude/hooks/pipe_gate.py:107` truncates at 200 characters and is the only
  transformation applied

So a repo-wide search puts its own search terms into the repository, and the
searcher performs no write. Measured instance, `.claude/hooks/gate.log:192`: a
`grep -rn "409\|503"` over the mobile tree left `409` in the log three times on
one line. Nobody wrote it there. The gate did, on the searcher's behalf.

**THE PROPERTY THAT MAKES THIS ITS OWN MECHANISM: the correction run is
contaminated too.** Re-running the query to check whether the medium is clean
writes another copy of the token. There is no re-measurement that
decontaminates; the token is spent at first use.

**Measured three generations deep, which is the best evidence in this file.** An
rg experiment ran at `gate.log:211` and `:215`. A later command went looking for
`:211` — and landed at `:216`. The check for contamination contaminated the log
again. Between one reading and the next, with no other cause, the match count
for the probe token moved from **4 to 5**. That is the mechanism as a moving
number rather than as an argument, and it is stronger evidence than the incident
this lesson was first proposed from.

**CLAUSE 1 IS NOT "NAME THE WRITERS". IT IS "NAME THE WRITERS AND THE ACTIONS
THEY FIRE ON",** and that distinction was measured rather than reasoned. A
census of the gate log by tool —

    185  ALLOW Bash
     11  ALLOW commit
      4  ALLOW

— shows the gates log **shell calls only**. No Read, no Grep, no Glob entry
exists. So a read-only agent holding Read/Grep/Glob does not contaminate this
medium at all, and a session holding Bash contaminates it on every call. Whether
you are polluting the thing you are measuring depends on **which tool you picked
up**, which is not a detail and is not visible in the result.

**The remedy is a token the writer cannot have seen** — generated inside the
program under test, or a hash prefix rather than the literal you typed — or a
snapshot of the medium taken before your first query.

## Mechanism 3 — the counter's own text was inside its own input

A counting command whose own text contained the literals it was counting
subtracted its own hits and returned a NEGATIVE count.

*(INCIDENT NOT REPRODUCIBLE FROM THIS REPO. Searched: `grep -c|wc -l|count` over
`.claude/hooks/gate.log`, 13 matching lines, none a self-subtraction; no script
in the searched scratchpad subtracts its own hits. It is written down here
because this is now the only place it exists — the same disclosure
[[a-check-that-never-went-red-was-never-observed]] carries for its own
unrecorded case.)*

**Nothing wrote.** That is what separates it from 1 and 2. The instrument's text
was already inside the input set, because the scope that defined that set
happened to include the command. So the question that catches the first two —
*who wrote to this while I was reading?* — returns "nobody", correctly, and the
reading is still wrong.

**The correction IS the defect.** In 1 and 2, excluding your own record is the
remedy. Here it was attempted and over-removed, because it excluded **by
content** — drop lines containing my needle — which necessarily removes the true
positives that resemble the observer's own record.

**It is the only one of the three that announces itself.** A plausible number is
accepted; a negative count is outside the domain of counting and cannot be
mistaken for an answer. That tells you which of the three you may hope to catch
from the output alone, and — by contrast — that the other two you may not.

**It arrived again, in a different instrument, and this one is in-repo.**
`tools/verify_citations.ps1` resolves a citation by counting how many lines of
the TARGET file contain the handle, and requires exactly one. When the target is
the same file the citation is written in, the citation line contains the handle,
so the count includes the observer and can never be one. The first half of this
mechanism — the instrument's own record already sitting in its input, with no
writer involved — with the over-removing correction absent. A same-file citation
in this repo is therefore not a citation that is broken; it is a citation that
cannot exist, and must be written as prose instead.

## The test, and the single-clause version that failed

The platitude to beat is "be careful your measurement doesn't affect the
result", which names no check and so cannot be run.

**The first attempt was a single clause, and it is kept here because the
falsification is the argument:**

> *Name every writer to the medium you are about to read, and ask whether you are
> one of them. Then re-run with your own record excluded and require the number
> to move.*

| | mechanism 1 | mechanism 2 | mechanism 3 |
|---|---|---|---|
| single clause | **CAUGHT** | MISSED | MISSED |

It misses 2 twice over — a gitignored runtime log is not what anyone means by
"the medium", and the prescribed re-run writes another copy of the token. It
misses 3 entirely: no writer exists, so step one honestly returns nobody, and
step two *is the bug* — the subtraction that over-removed.

**One clause caught one of three. The test is therefore three clauses, run
together, before a reading becomes evidence:**

1. **WRITERS.** Name every writer to the medium, including anything that fires
   on your behalf — a hook, a gate, a shell history, a transcript, a capture —
   **and the actions it fires on.** In this repo that list is not empty and not
   abstract: `.claude/settings.json` `"matcher": "*"`, `pipe_gate.py:237`,
   `commit_gate.py:199`, shell calls only.
2. **BURNT TOKENS.** If a writer you found fires on YOUR query too, you may not
   correct by re-running — a stable or rising count is the *expected* reading of
   a contaminated medium. Snapshot before, or use a token that writer cannot
   have seen.
3. **DOMAIN, AND EXCLUDE BY IDENTITY.** Before reading a corrected count's
   value, assert its domain: `>= 0`, `<= the uncorrected count`, moved by
   exactly the delta you predicted. A value outside it indicts the CORRECTION,
   never the subject. And exclude by identity — this path, this record id, this
   pid — never by content.

| | mechanism 1 | mechanism 2 | mechanism 3 |
|---|---|---|---|
| clause 1 WRITERS | **CAUGHT** | may miss | misses (no writer) |
| clause 2 BURNT TOKENS | — | **CAUGHT** | misses (no re-run) |
| clause 3 DOMAIN / IDENTITY | stops the wrong fix | — | **CAUGHT** twice |

**Each is caught by a different clause. That is the argument for one file**, and
it is not that the remedies are similar — they are three different actions. It
is that a session runs the three together or is unprotected, and a session that
runs clause 1 and stops is exactly the session that ships 2 and 3.

**Residue, stated rather than hidden:** if a session suspects nothing and never
attempts a correction, nothing here fires for mechanism 2. The only thing that
closes that gap is clause 1 being CONCRETE — a named path, not a category —
which is why the wording above names files and line numbers.

## Why it is not one of the neighbours

- **Not [[a-check-that-never-went-red-was-never-observed]] mechanisms 1-2, the
  empty needle.** Those are defined there as vacuously true — no input exists
  that fails them. Every reading here *could* have come out differently; the
  haystack was full and answered honestly.
- **Not its fifth mechanism, the instrument that never read the artifact.** That
  is a scope failure: the checker did not OPEN the file, and its zero is a true
  statement about a smaller set. **The boundary is the direction of causation** —
  there the instrument fails to reach the medium, here it is inside it. Ripgrep
  skipping a gitignored path belongs there, not here.
- **Not its ninth mechanism, the empty haystack.** There the collection came back
  empty *from the system under test*. Here the collection was full and included
  the observer.
- **Not [[a-checker-must-not-share-the-code-it-checks]]**, whose "a measurement
  that returns its own input" is the closest sentence in the corpus and means
  something else: the SUBJECT's property echoed back through a broken needle. The
  subject wrote nothing and the instrument added nothing.
- **Not [[proof-must-run-twice]]'s fourth amendment**, the proof that normalises
  its own fixture. That is a deliberate WRITE performed as setup, contaminating a
  LATER run; its remedy — create the fixture rather than find it — is unavailable
  to a read-only scan contaminating the run it is in.

## The remedy is already in this repo, and no lesson had named it

`server/scripts/build_all_lessons.py` excludes its own output from its own input,
by identity, in the function that gathers sources:

    """Lesson files in ASCII filename order. Excludes the index and our output."""
    ...
    (p for p in lessons_dir.glob("*.md")
     if p.name not in (INDEX_NAME, OUTPUT_NAME)),

`OUTPUT_NAME` is the file the generator writes. Without that clause the generated
concatenation would be an input to its own next generation, growing every run.
The exclusion is by NAME, not by content — clause 3, implemented correctly, years
before anything here was written down.

## How to apply

1. **Before citing any scan, count or log read, run all three clauses.** Not the
   one that seems relevant: a session that runs clause 1 and stops is the one
   that ships mechanisms 2 and 3.
2. **Ask which TOOL you are about to use, not only what you are about to look
   for.** The gates here log shell calls and nothing else, so the same question
   asked through Grep and through Bash contaminates differently.
3. **Exclude by identity, never by content.** A content filter deletes the true
   positives that resemble your own record.
4. **Assert a corrected count's DOMAIN before reading its value** — `>= 0`, `<=`
   the uncorrected count, moved by the predicted delta. An impossible value
   indicts the correction, not the subject.
5. **Treat a probe token as spent once the query is issued.** If anything logs
   your commands, uniqueness is gone and no re-run restores it.
6. **When you must check whether a medium is contaminated, do not check it with
   the tool that contaminates it.** Read the file directly, or take the snapshot
   first.
7. **A citation whose target is its own file cannot resolve.** Write it as prose.

---

**SOURCE:** `two-green-proofs-do-not-cover-the-seam.md`

# Two green proofs do not cover the seam between them

**Applies to** any behaviour a user meets that passes through more than one
proven component — and to every claim of the shape "X is proven, and Y is
proven."

**The rule:** two components proven separately are not a proven composition. The
next defect is at the seam, because the seam is the one place no proof file
owns. Find it by asking which proof drives BOTH sides — and when the answer is
"none", that is the finding, not a gap to note and move past.

## The strongest instance this repo has

Two proofs, both green, both correct:

- **`mobile/src/proof/proveSync.ts:1184`**, `case11SessionExpired` — the session
  expires with bills queued. It covers a 401 arriving mid-queue on both stores,
  including a deliberate disproof (11a-legacy, 11c) driven by
  `LegacyUnauthorizedTransport` to show the old classification told the operator
  one of two false things.
- **`mobile/src/proof/proveSignOut.ts`**, S1 — a non-empty send queue refuses the
  sign-out and names the count.

Neither is wrong. Neither is weak. And they cannot see each other:

```
grep -n "signOut" proveSync.ts      ->  0 matches
grep -n "401"     proveSignOut.ts   ->  0 matches
```

Run both ways, both zero. `proveSync` knows everything about a dead token and
has never heard of sign-out. `proveSignOut` knows everything about the sign-out
gate and has never heard of a 401. **The composition of the two is driven by
nothing.**

## What lives in the gap

Observed on a real iPhone, 2026-08-06, recorded in `OPEN_ITEMS.md` under the
entry opening **"The sync strip says the phone is OFFLINE while the server is
refusing its token"** — cited by its first sentence rather than by a line range,
because that file grows and a range goes stale silently. A bill queued, the
session revoked from the PC, Wi-Fi at full strength. Over three
minutes the bill cycled `รอส่ง` → `กำลังส่ง` → `รอส่ง` and never sent. Two
sentences were on the screen at once, both false:

```
sync strip : ออฟไลน์ — เก็บไว้ในเครื่อง 1 ใบ จะส่งให้เองเมื่อเน็ตกลับมา
             ("offline — will send by itself when the network comes back")
sign-out   : ยังออกจากระบบไม่ได้ / มีบิลรอส่งขึ้นระบบ 1 ใบ /
             รอให้ส่งครบก่อน แล้วจึงออกจากระบบได้
             ("wait until they are all sent, then you can sign out")
```

The network was up. The queue could not drain, because the token was dead. So
the strip promised a recovery that was not coming, and the sheet instructed the
operator to wait for a condition that could never arrive — on the one device
holding an unsent bill, with the one action that would fix it (sign in again)
refused by the gate. **A third renderer on the same build, in the same minute,
got it right**: the daily money screen drew `ต้องเข้าสู่ระบบใหม่` with a working
sign-in button.

> **CORRECTION, 2026-08-07 — HALF OF THE INSTANCE ABOVE DID NOT HAPPEN, and the
> half that did is worse for it.** The strip line is struck. Restaged on the same
> handset with the transform cache cleared and the bundle reloaded, the strip drew
> `หมดเวลาเข้าใช้งาน — ต้องเข้าสู่ระบบใหม่ บิล 1 ใบยังอยู่ครบ จะส่งให้เองหลังเข้าสู่ระบบ`
> with a working sign-in button, and held it for five minutes. **`statusNotice.ts`
> classified the 401 correctly the whole time**; the `ออฟไลน์` reading came from a
> stale bundle and is not a property of any committed code — see `CLAUDE.md §
> Machine footguns`, the Metro transform-cache entry. What remained was the sheet
> alone, and that is the sharper finding: there was never a deadlock. The exit
> existed, two centimetres up the same screen, working, and pressing it posted the
> bill immediately. The sheet could not see it because it had no input for WHY the
> queue was stuck. Fixed and proven in R2b; the rule it produced is the R2b
> amendment to [[correct-classification-can-still-render-as-an-error]].
>
> **What this lesson claims is unharmed, and was confirmed by being acted on.** The
> two greps below were the whole argument and neither depended on the strip. The
> seam test prescribed in *How to test for it* was then written —
> `proveSignOut.ts` S9, driving both sides in one run and asserting negatively on
> the rendered composition — and it found a real defect that both green proofs had
> been unable to see. A lesson whose remedy was executed and paid out.

Each half is defensible alone. The queue really is blocked; bills really are
pending. The trap only exists once both are true at the same time, and no proof
puts them there together.

**The cause is NOT settled and this lesson does not settle it.** `OPEN_ITEMS.md`
names two candidates with different fixes and deliberately accepts neither; the
diagnosis is running in its own read-only session. What is established here needs
no cause at all: the two greps above are the whole argument, and they were true
before anyone opened `engine.ts`.

## Why "both are proven" is the seduction

The seam is invisible from every position that could report it:

- **Each proof file's coverage looks complete from inside itself.** `proveSync`'s
  case 11 has a disproof arm; that is a proof written by someone being careful,
  and care applied within a boundary does not cross it.
- **No file is missing.** There is no empty test to notice, no `TODO`, no
  skipped case in a summary. The count of green cells goes UP as each component
  is proven harder, and the seam does not appear in that count.
- **The failure needs two subsystems in one state,** which is exactly the state a
  unit proof is designed to avoid constructing.

This is the wider form of what
[[correct-classification-can-still-render-as-an-error]] already carries: there,
one card drawn by two renderers, 448 green cells, and the defect in the
CONCATENATION. The difference is the boundary. There the composition sat inside
one screen that one proof could reach; here it spans two subsystems whose proof
files do not share a single identifier. The remedy there — *assert the
concatenation in draw order* — presumes you know where to look. This lesson is
about finding that place first.

## How to test for it

1. **Name the components a user-visible behaviour passes through.** For this one:
   transport classification → store transition → queue health → sync strip →
   sign-out gate → sheet wording. Six, across two proof files.
2. **Grep each proof for the other's vocabulary, both directions.** Zero matches
   both ways is an unproven seam, and it is a two-second measurement. Do it for
   every adjacent pair, not just the pair you suspect.
3. **Write one case that drives both sides in a SINGLE run** and asserts what the
   operator ends up looking at — the rendered text, in draw order, from a state
   reached by real transitions rather than assembled by hand
   ([[a-proof-fixture-must-be-a-row-the-product-could-produce]]).
4. **Assert NEGATIVELY on the composition.** "The strip does not promise a
   network recovery while the session is dead" is the claim. Both components pass
   every positive assertion already; only a negative one over the pair can fail.
5. **Give the seam test a home.** It belongs to neither component's file, so it
   will not be written unless something owns compositions explicitly. A test that
   has no obvious file is the test most likely never to exist —
   [[a-check-that-never-went-red-was-never-observed]] is about cells that cannot
   fire; this is about the case that was never written, which is the same blind
   spot one step earlier.

## The general form

**Ask of any two components: what does the user see when both are in their
unhappy path at once?** Proof coverage is measured per file and defects are not.
Every subsystem boundary in this project — transport/store, store/health,
health/screen, gate/sheet — is a place where two correct halves can compose into
a screen that lies, and no amount of proving either half harder will reach it.

---

**SOURCE:** `unavailable-is-not-rejected.md`

# A failure to reach a verdict is not a negative verdict — and not every verdict is final

**Context.** Every sync path has failure shapes that look identical from the call
site — all of them are "the send didn't work" — and must be handled in opposite
ways. There are THREE, not two.

- **UNAVAILABLE** — no network, timeout, socket closed, 5xx, expired token, or a
  response that was lost after the server may already have committed. The
  outcome is UNKNOWN. We do not know whether the bill exists on the server.
- **REJECTED, PERMANENT** — the server received the bill, understood it, and
  refused it on the payload's own merits (422: malformed money, net ≠ gross −
  tare, cross-tenant reference). The outcome is KNOWN and it is bad, and nothing
  anyone does will make THIS payload valid.
- **REJECTED, RESOLVABLE** — the server received the bill, understood it, and
  refused it because MASTER DATA it depends on is not set up (424: no price tier
  for the seller's grade, seller has no grade). The outcome is KNOWN and it is
  bad *today*. It becomes valid the moment the back office adds the price —
  without the bill changing at all.

## The question that separates them

The useful question is **not** "did it fail". It is:

> **Can anything make this bill valid later — and does the failure name what?**

- No, nothing can → PERMANENT. Terminal, surfaced for correction.
- Yes, and the server named it → RESOLVABLE. Park it, retry when that thing is
  fixed.
- We do not even know whether it failed → UNAVAILABLE. Retry forever.

"Does the failure name what" is load-bearing, not decoration. A refusal the
client can only recognise by string-matching an error message is not a
classification, it is a guess that breaks the first time someone rewords a
message or translates it. The server must state the kind in a form the client
reads structurally — here a distinct status code (424), with a machine-readable
`code` in the body for the UI. If the server cannot name it, treat it as
PERMANENT: better one bill visibly needing attention than a silent retry loop.

**Rule.** Classify every send outcome into one of these three before deciding
anything else, and make the type system carry the distinction rather than a
boolean or an exception. Then:

- UNAVAILABLE -> back to `pending`, `attempt_count++`, `last_error` recorded,
  retry with the SAME idempotency key, with backoff, **forever**. No attempt cap:
  a yard can be offline for days, and a bill marked `failed` for being offline is
  a lie about real money.
- REJECTED, PERMANENT -> `failed`, terminal, with the server's reason kept and
  shown. Never silently retried.
- REJECTED, RESOLVABLE -> PARKED: still `pending` and still owed, but removed
  from the sendable queue so it cannot dam the bills behind it, held in a named
  operator-visible state carrying the server's code, and retried on a slow
  cadence or when the operator says the data is fixed. Same idempotency key, so
  the eventual retry cannot duplicate. Retry backoff is the WRONG cadence here:
  retrying sooner cannot make a human add a price faster.
- A transport that **throws** is UNAVAILABLE, never REJECTED. A throw carries no
  information about whether the server committed.

**Why (the failure it prevents).** Conflating them breaks in both directions:

- Marking UNKNOWN as `failed` **loses bills**. Nothing retries a failed record,
  so a bill that merely hit a dead spot is abandoned. If the server had in fact
  committed it, local and server now disagree permanently; if it hadn't, the sale
  is simply gone. Either way the loss is silent — the record says "failed" as if
  someone decided that.
- Marking REJECTED as retryable **hides the bill instead of surfacing it**. It
  loops in `pending` forever, burning battery and data, and never reaches the
  operator as something needing correction. Staff see a bill that "hasn't synced
  yet," re-key it by hand, and now one load has produced two bills — one broken
  and hidden, one manual. That is the duplicate.
- Marking RESOLVABLE as PERMANENT **strands a load that has already been
  tipped**. The bill is terminally failed for a reason that stops being true five
  minutes later when the office adds the price — but nothing retries a `failed`
  record, so the only recovery is to re-weigh scrap that no longer exists as a
  separate load. The shop either loses the purchase or invents a weight. This is
  the failure that forced the third class: the two-way split was not wrong, it
  was too coarse.

There is a second-order trap: if this split is wrong, your sync metrics measure
network uptime instead of data quality. "Failed bills" becomes a graph of dead
spots, and the genuinely malformed bills are invisible inside it.

**Scope.** This governs every sync path built from here — bill sync, master-data
pull, any future upload queue — not only the purchase-bill engine. The retry
side only stays safe because the idempotency key is generated once and never
regenerated; see [[sync-state-needs-startup-recovery]].

**Where proven.** `mobile/src/sync/types.ts` models it as the `SendOutcome`
union (`accepted | duplicate | rejected | rejected_resolvable | unavailable`) so
a missed case is a compile error, and `mobile/src/sync/engine.ts` catches any
thrown send into `unavailable`. In `mobile/src/proof/proveSync.ts`: CASE 2 and
CASE 3 prove unavailable stays retryable (including after the server already
committed); CASE 7 proves a 422 lands in `failed`, keeps its reason, and is never
picked up again by `listReadyToSend`; CASE 10 proves the three-way split — 10a a
424 parks WITHOUT jamming the queue, 10b the SAME bill and SAME idempotency key
sync once the price exists (no re-weighing, no duplicate), 10c the slow cadence
releases it with no operator at all, 10d a malformed bill is still terminal and
is not touched by the release path. Server side,
`server/scripts/prove_master_data_gate.py` proves it over real HTTP: 424 carrying
`kind` and `code`, no bill row created and no `doc_no` burned, malformed input
still 422, then the byte-identical payload accepted once the price is added.
Generalised from defensive-coding rule #1.

**The ordering price.** Parking takes a bill out of the sendable queue, so it
receives a higher `doc_no` than loads weighed after it. That exemption and its
bound are recorded in [[doc-no-is-arrival-order-not-event-time]]; read it before
introducing any further "skippable" state.

## Amendment (P-SELLERKIND-DESIGN, 2026-08-23): a class is on loan from the client, and the client can take it back

The three classes above read as properties of the FAILURE. **They are not.** Each
assignment rests on a PREMISE about what the client could possibly be holding, and
that premise belongs to the client — which changes independently, and silently.

**Measured on `POST /bills`.** An unresolvable `seller_id` is **422, PERMANENT**,
and the route's own header states the reason rather than leaving it implicit: a
reference that does not resolve at all stays permanent because *the device got
those ids from this tenant's own /sellers and /products, so a miss means a corrupt
or stale reference, not a setup gap.* **That is correct today, and it is correct
BECAUSE OF THE PREMISE and not because of the status.** An id the device could
only have obtained from the server, which the server cannot find, really is
corrupt, and nothing anyone does will make that payload valid.

**OFFLINE SELLER CREATION REMOVES THE PREMISE AND EDITS NEITHER END.** After it,
the device legitimately holds seller ids the server has never seen. The same 422,
from the same line, over the same payload, changes class: the bill becomes valid a
few seconds later, unchanged, which is this file's own definition of RESOLVABLE.
**Nothing on the server is edited, nothing fails to compile, no proof turns red,
and the sentence beside the rule still reads as true** — it names `/sellers` and
`/products`, and both still exist. The premise it rests on is somewhere else
entirely.

**AND THE COST LANDS EXACTLY WHERE THIS FILE ALREADY SAYS IT DOES.** Marking
RESOLVABLE as PERMANENT strands a load that has already been tipped: the first
offline walk-in would produce a terminally failed bill for cash already paid, on a
row hard rule 5 forbids deleting.

**THE DISCRIMINATOR.** Ask of every PERMANENT classification: *what would have to
become true for this to be resolvable?* If the answer is a fact about what the
CLIENT CAN HOLD rather than about the payload itself, the class is on loan from
the client and will change when the client gains a capability. Conversely, a class
that turns only on the payload — malformed money, net ≠ gross − tare — is not on
loan and cannot move.

**WHERE THE REPAIR WENT, AND IT IS NOT WHERE IT LOOKS.** The design did NOT
reclassify the server's 422. The rule is still right for a genuinely corrupt
reference, and weakening it would make a real corruption retry for ever, which is
this file's first failure direction. Instead the bill is parked ON THE DEVICE,
before the request is ever sent, under the exemption
[[doc-no-is-arrival-order-not-event-time]] already argues — so the request the
server would misclassify is never made. **Where a class is on loan, stopping the
request can be cheaper and safer than re-answering it**, and it leaves the
server's rule intact for the case it was written for.

**BOUNDS.** Nothing has shipped wrong. P1.8b is unbuilt at `287417c` and this
records a premise BEFORE the change that falsifies it lands, which is the only
time this is cheap. **The other two classes were not swept:** whether any
UNAVAILABLE or RESOLVABLE assignment anywhere rests on a client-owned premise is
not measured here, and the same question would have to be asked of each.

---

**SOURCE:** `wait-for-the-event-not-the-ticks.md`

# A fixed number of ticks is not a synchronisation primitive

**Rule: a test must never wait a fixed number of microtasks (or `setTimeout`
delays) to reach the state it wants to observe. Wait for the observable EVENT,
with a bound, and print how long it took.** If there is no observable event,
add one — that is cheaper than a test whose meaning drifts.

## What happened

`proveSync.ts` CASE 6 proves the in-flight guard: while a send is hanging, the
bill must be `syncing`, and a competing claim must be refused. It set the scene
like this:

```ts
const first = engine.runOnce();
const second = engine.runOnce();
await Promise.resolve();   // "let both runs get as far as they can"
await Promise.resolve();
await Promise.resolve();
const midFlight = await r.store.getBill(bill.id);
```

Phase 2c-3 added a `Mutex` to the SQLite driver (the cart's draft -> bill
promotion needs a real transaction). Each store operation now costs extra
microtask hops. The three ticks stopped being enough to reach the claim, and
the case went red:

```
[FAIL] bill is claimed (syncing) while in flight — state=pending
```

Nothing was broken. The engine was fine — every other check in the same case
passed, including "a competing claim on an in-flight bill is refused", which
could only pass if the claim HAD happened by then. The test was simply looking
at the wrong moment.

The fix waits for the thing itself:

```ts
const yields = await waitFor(() => gated.started.length === 1);
```

which then reported `send entered after 1 yield(s)` — one **macrotask**, a point
three microtasks could never have reached.

## Why this is worse than the red run

Red is the lucky outcome. A tick count encodes the current shape of the
scheduler into the test, and the same drift can move the observation the other
way — past the window, into the state AFTER the interesting one. Then the
assertion still runs, still passes, and is measuring nothing. The in-flight
guard is the single thing standing between the customer and a double-sent bill;
a version of CASE 6 that observes after the send completed would assert
`syncing` against a settled row and be green forever.

So the failure mode is not "the test breaks when I change the storage layer".
It is "the test silently stops testing what its name says, at some unknown
future change, with no signal". Same shape as
[[concurrency-tests-need-a-barrier]]: there, workers that never overlapped; here,
an observation that never landed in the window. In both, **green is not
evidence until you can show the measurement happened when it claims to.**

## How to apply

1. Never `await Promise.resolve()` N times to "let things settle". Ask what
   event you are actually waiting for.
2. Wait on that event with a bound and a failure value (`waitFor` returns `-1`
   rather than hanging), so a genuine hang is a visible failure, not a timeout.
3. Print the cost (`after N yield(s)`). It makes a drift visible as a changing
   number long before it becomes a wrong result.
4. Suspect this whenever a timing-shaped test changes colour after a change to a
   layer BELOW it that has no business affecting correctness.

**Where proven.** `mobile/src/proof/proveSync.ts` — `waitFor()` and CASE 6, which
now passes identically on the in-memory store and the real SQLite store. The
mutex that exposed it is `mobile/src/adapters/sqlite/mutex.ts`.
