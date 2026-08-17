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
