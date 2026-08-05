# Briefing — Recycle Online

**Who this is for.** A conversation partner who has never seen this codebase and
will not read it, but is asked to ADVISE: is this the right next thing, is that
argument sound, what is being missed.

**What is in here** is what changes rarely — the product, the architecture and its
reasons, the invariants, and the shapes of mistake already paid for. What MOVES as
work lands is not: `PROJECT_STATUS.md` holds status, `OPEN_ITEMS.md` the
outstanding queue, `lessons/` the mistakes in full. Two copies of a status drift,
and a new reader believes whichever one they opened first.

**Freshness.** No progress claims live here; where a fact is dated it says so, and
a dated fact is only as good as its date. Update this file when the ARCHITECTURE or
a HARD RULE changes — not at every phase. If it starts reporting progress, it has
begun to rot.

## 1. What this is, and the constraint that shapes everything

A management system for recycling / scrap-buying shops in Thailand. A yard buys
scrap over a weighbridge, pays cash on the spot, and needs a purchase bill for
every load. Sold as a monthly-licence SaaS to many shops at once. Two kinds of
user: **yard staff** on a phone beside a truck, often with no signal, and the
**owner / back office** on a PC — master data, bills, printed slips, and the day's
takings to balance the cash box against.

**The constraint is three words, and each reaches into every file:**

- **Real money.** These rows are cash that has already left a till. Integrity
  beats features, speed, convenience and a tidy schema. Nothing is ever deleted;
  nothing historical is ever recomputed. Where the choice was "correct" or
  "pleasant", it has already been made.
- **Offline-first.** The phone must complete a purchase with no network — the load
  is tipped on the pile either way. So the phone is the FIRST WRITER and the
  server is the AUTHORITY, and the gap between them is a visible first-class
  state, never papered over by the UI.
- **Multi-tenant.** One shop must never see another's data. Not "must not" by
  discipline — **cannot**, by construction. Shop A's bills and shop B's sit in the
  same tables in the same database.

## 2. Architecture — decided facts, each with its reason

**LOCKED.** Do not propose alternatives; do help defend them. These are the actual
arguments, not rationalisations.

**Three programs, one API.** `server/` (FastAPI + PostgreSQL) is the single source
of truth and holds **all** business rules — document numbering, deduplication,
stock, price resolution. `mobile/` (React Native + Expo) is the yard floor:
creates bills, offline-first, weight TYPED BY STAFF (no scale integration in the
MVP). `desktop/` (Electron) is the back office: master data, bill viewing, thermal
ESC/POS slips.

**Both clients are clients of that one API. Neither touches the database. Neither
implements a business rule.** Not purity: a rule implemented twice drifts at
exactly the boundary neither author tested, and here "a rule" means the number on a
legal document or the price a shop pays in cash. One authority, or two answers.

**Money and weight are NUMERIC everywhere — never float**, in the database, the API
payload and client arithmetic. A float error is a fraction of a satang that is
silent, permanent, and lands in someone's cash reconciliation. (The mobile decimal
library needed its precision raised for this domain's scale; the default rounded
mid-multiply.)

**Tenant isolation is PostgreSQL row-level security, set per request transaction —
not a `WHERE tenant_id` in each handler.** A forgotten `WHERE` is one keystroke and
no test fails; a policy is a property of the table that no handler can forget.
Context is `SET LOCAL` inside the transaction, never a session `SET` — a pooled
connection would carry that into the next request, the exact failure being
defended against. **No context means NO rows**, never all rows.

**A bill's id is a UUID the phone generates; the human-readable `doc_no` is
assigned by the server at sync.** The phone must create bills with no network, so
it must be able to name them — but the visible number is a legal sequence, and a
sequence has one issuer. A bill that has not reached the server has NO number, and
the UI must SAY so rather than show a placeholder that looks like one.

**Every bill create carries an idempotency key** — a phone that loses the response
and retries must not buy the load twice. **Voids, never deletes:** a wrong bill is
voided with who, when and why, and a correct one reissued. The history IS the
audit trail.

**Store UTC, keep two timestamps.** `device_created_at` is what the phone claims;
`server_received_at` is when the server had it. Device clocks are untrusted — ~3 s
of real skew has been measured on this project's own hardware, and a phone 14 h
fast has been observed. Every report aggregates on `server_received_at`. Rendering
converts to SHOP time (fixed UTC+7) and derives the Buddhist-era year AFTER that
conversion; the other order is correct-by-luck most of the day and wrong across
Bangkok midnight. พ.ศ. appears in the UI and on printed slips only. Code and
commits in English, UI text in Thai.

## 3. Built and proven, versus built and unverified

**This distinction is the project's entire discipline, so be pedantic about it.**
**Proven** = the real path ran and the result was OBSERVED: an actual HTTP request
and response, rows read back out of Postgres, a screen seen on a real handset —
and every such observation is dated. **Built** = the code exists and the types
check, which is not evidence of anything. "It should work" is not a status.

Three mechanisms hold the line; ask which one a claim comes from:

- **Proof scripts** — server-side scripts exercising real endpoints against a live
  database, plus headless mobile scripts driving the sync engine and the pure
  rendering logic. Each must pass **twice in a row with no reseed**, which catches
  a proof that was really measuring its own leftover fixtures.
- **The reconciler** — a separate instrument that checks the money against itself
  rather than exercising a path. It makes no fixtures, writes nothing, and is meant
  to be pointed at a REAL database. A companion breaks each invariant on purpose
  and asserts the checker fires, NAMES the offending row, and clears on undo.
- **Device passes** — a human holding a real phone, the result read out of the
  server log and the database, never off the screen.

**Standing unverified items** (dated list: `PROJECT_STATUS.md`, *Known device
gaps*): Android has had one pass on one borrowed handset; the crash window of the
on-device SQLite transaction path has no headless proof; two devices writing
inside the same millisecond is proven headless only; and one reconciler check is
deliberately **unproven by execution**, because the only way to fire it would
disable tenant isolation cluster-wide while it ran — so it is labelled rather than
quietly counted green. **Read the dates, not the achievements.**

## 4. The invariants, in plain language

Eight rules. Breaking one is not a trade-off, it is a defect.

1. **Money is stored as exact digits, never a computer's approximation of a
   number** — approximations accumulate errors nobody can later explain.
2. **Every row belongs to exactly one shop, and the database itself refuses to
   hand a shop another shop's row.** Not the application — the database.
3. **The permanent bill number comes from the server, and a bill that hasn't
   reached it doesn't have one** — the screen says so honestly rather than
   inventing a number.
4. **Sending the same bill twice must not buy the load twice.** The phone will
   retry; the server must recognise the repeat.
5. **Nothing is ever deleted.** A wrong bill is cancelled on the record — who,
   when, why — and a corrected one issued alongside it.
6. **Store all three weights, both prices (paid and list) and the computed amount
   on the row.** A bill from last March is never re-priced from today's list.
7. **Keep both times: when the phone says it happened, and when the server
   received it.** Phone clocks are wrong, sometimes by hours.
8. **The phone writes locally first, always, and shows every record's state —
   waiting, sent, failed.** An invisible failure is worse than a loud one, because
   the yard keeps buying.

## 5. The lessons, compressed

**32 lesson files** in `lessons/`, each written after a real mistake or a
non-obvious constraint; `lessons/README.md` indexes them and every line bites. But
they are not 32 independent things — **four shapes cover most of them**, and the
shapes are what an advisor needs.

**(a) A passing result is not evidence.** A green says the assertion did not fail,
not that it COULD have failed; ask what a green would look like if the thing were
broken. Here: a proof passed because it was measuring its own fixture from the
previous run; a backup "succeeded" having captured zero rows, because the dumping
role was itself bound by row-level security; a safety branch was dead code for
months because it read an attribute that does not exist, and a defaulted read made
ABSENT look like a confident negative; concurrency "tests" ran their workers
sequentially; and a checker that imports the code it checks can only prove the
code equals itself.
→ `proof-must-run-twice.md`, `a-proof-fixture-must-be-a-row-the-product-could-produce.md`,
`a-backup-is-a-claim-until-it-is-restored.md`, `a-defaulted-getattr-is-a-silent-dead-branch.md`,
`concurrency-tests-need-a-barrier.md`, `a-checker-must-not-share-the-code-it-checks.md`

**(b) Classify a failure by what it is ABOUT, before choosing how to react.** Is it
about the PAYLOAD (this bill is malformed), the NETWORK (nobody answered), the
SERVER'S STATE (the price list isn't set up yet), or the CALLER (you are no longer
signed in / you may not do this)? Four different reactions, and collapsing any two
produces a bug invisible in review. An unknown outcome must retry forever; a
permanent refusal must stop; a *resolvable* refusal must park — still owed, out of
the queue, retried when the office fixes the data — because marking it permanent
strands a load already tipped on the pile. A 401 is about the caller, not the
bill, so none of the three bill-classes answers it. A 403 is also about the
caller, but the caller IS someone and no tap on this device fixes it — a fourth
class, whose message must name the shop OWNER, never "sign in" or "call support".
→ `unavailable-is-not-rejected.md`, `401-is-about-the-caller-not-the-bill.md`,
`403-is-about-what-the-caller-may-do.md`, `queue-jam-must-be-visible.md`,
`diagnosis-must-precede-the-fix.md`

**(c) A correct backend is not a correct product until the screen agrees.** Every
layer can be internally correct and the product still wrong, because a user acts
on what is DRAWN. A perfectly classified, logged and retried state was rendered to
a yard worker as a red error with raw JSON and a UUID in it. A card assembled from
two independently-correct renderers promised an automatic retry two lines above a
notice saying the system had NOT done it — hundreds of green assertions could not
see it, because none asserted the CONCATENATION in draw order. Two corollaries: a
message naming an action must be DERIVED from the cause, and a defaulted value
that cannot make the operation succeed is not a convenience — it is a wrong number
the yard pays cash against.
→ `correct-classification-can-still-render-as-an-error.md`, `console-is-not-the-observation.md`,
`fallback-default-is-a-wrong-number.md`, `cached-master-data-is-a-price-claim.md`

**(d) A stored instant is a claim about a clock you don't control.** A stamp
outside the window its writer could possibly have produced is EVIDENCE ABOUT A
CLOCK, not data — and must be checked at READ time, because the clock moved after
the write. A phone 14 h fast, then corrected backwards, stranded an entire send
queue for 14 h while the server sat there answering. In business terms: a value
derived from a timestamp must come from the timestamp actually STORED, read once
and used for both purposes. Two clocks read a fraction of a second apart put a
bill's document-number year one Buddhist year ahead of its arrival year — opening
next year's counter early, which would have left a permanent, unrepairable gap in
a legal document sequence.
→ `render-in-shop-time-not-device-time.md`, `be-year-comes-after-the-timezone.md`,
`a-stored-future-instant-is-a-promise-about-a-clock.md`, `doc-no-is-arrival-order-not-event-time.md`

## 6. Where it is now, and the next decision

**Status lives in `PROJECT_STATUS.md`** — current phase, what landed, what is
verified and when. Deliberately not summarised here.

**`ROADMAP.md` holds the order and the dependencies** — what must be true before
what, and why — and answers "what next, and why that" on its own. **`OPEN_ITEMS.md`**
holds everything outstanding, one line each, unranked: an item absent from the
roadmap is not off the list, it is off the critical path. Steps are numbered R1, R2 …
there; the A-numbers in `PROJECT_STATUS.md` are a closed log of finished phases and
no new one will be issued.

**The tension an advisor should hold on to**, as of 2026-08-05: work stops at every
phase boundary for review, and the project sits at one. Two directions, not the same
kind of work — **deepen correctness** on a system that has never had a paying user,
or **reach one real shop**. The first is where this project is strong and
comfortable; the second is where the remaining unknowns actually are. `ROADMAP.md`
takes the second, argues the order, and records where it disagrees with the framing
it was given — read its "Where I disagree with the spine" section before advising on
sequence.

## 7. What is deliberately NOT built, and what changes it

Absence here is a decision, not a backlog. Each has a condition.

- **Out of MVP entirely — do not build, do not scaffold:** sell flow, stock, other
  income/expense, checkbox permissions, employee master, buyers, profile images, QR
  codes, scale integration, Excel export, reports. *Changes when:* a real shop
  states the requirement to the owner — never when someone guesses one would.
- **The reconciler has no endpoint, schedule, UI or auto-repair.** It refuses to
  fix anything and says so in its own failure output. *Changes when:* somebody
  would actually act on a scheduled report. A checker that repairs can hide.
- **No suppression list in the reconciler — permanently rejected.** The mechanism
  that lets a checker ignore a row is the mechanism that lets it ignore the row
  that matters. No condition; this one is closed.
- **No thousands separators in rendered money.** Grouping means splitting the
  string, one edit from splitting it into numbers. *Changes when:* the owner asks
  — one place, plus a proof the digits are unchanged.
- **No index for the daily report's day filter** — an index is a write cost on the
  hot bill-creation path, paid to speed up a report nobody has opened. *Changes
  when:* ~a year of trade, or a shop says the day view feels slow. One migration.
- **No date picker on the daily screen** (day-at-a-time stepping instead).
  *Changes when:* a new dependency is justified.
- **`desktop/` is empty** — the gate on a shop running its own master data.
  *Changes when:* that becomes the priority. **Constraint for whoever builds it:**
  the printed slip must PORT the mobile shop-time module (offset, era, ordering),
  never re-derive `+543` in Electron — that drifts at the untested boundary.
- **No sign-out, and no way for the server to reject a token before it expires.**
  *Changes when:* it is scheduled. A SECURITY item, and the client half being
  nearly free is exactly why it must not be done by halves — a button alone would
  make it look handled while a minted token stayed valid.
- **Shop time is a fixed UTC+7 offset, not a named timezone**, on both sides: a
  named zone needs a runtime that can resolve one, and neither the phone's JS engine
  nor the server box is verified to. *Changes when:* a tenant needs a zone observing
  daylight saving — a schema change plus a device verification, not a config edit.
