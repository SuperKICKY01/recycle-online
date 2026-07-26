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

## Footnote: the fix nearly broke the void path

Naming the local `const reason = parkedReason(...)` inside the bill `.map()`
shadowed `BillsPanel`'s `const [reason, setReason] = useState("")` — the void
reason, proven in 2c-5. It would have silently detached the TextInput from its
state. Caught only because the Expo program is typechecked **separately**
(`npm run typecheck:app`), and nearly missed again because that command had been
chained as `npm run typecheck:app 2>&1 | tail -3 && echo CLEAN` — `tail` exits 0,
so the failure was reported as clean. Run each typecheck bare, with its exit code
visible. Never let a pipe decide whether a check passed.
