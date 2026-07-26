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
