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
const clockSuspect = now - Math.max(p, s) < -FRESH_MAX_AGE_MS;  // NOT min
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
