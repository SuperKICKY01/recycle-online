# A sum over nothing has no scale

**Applies to** every money or weight value SERIALISED from an aggregate — a
`sum()`, a `coalesce(sum(), 0)`, a `count(*) * price`, any expression a
query computes rather than a column it reads — and hardest where the wire
contract is "a decimal STRING with exactly two places" and the reader is a
screen that prints whatever string arrives.

**The rule.** The scale of a NUMERIC column does NOT travel through an
aggregate over zero rows. `coalesce(sum(a.amount), 0)` over no allocations is
the integer-shaped `Decimal('0')`, not `Decimal('0.00')`; Python's `str()`
renders it `"0"`, and a wire that promised `"0.00"` has broken its promise on
the one row that most needs to be read correctly — the unpaid one. Quantize at
the serialisation site, every time, the way `reports._money` already does
("Money is returned as STRINGS, everywhere, including zero"); never trust the
column's declared scale to arrive through a query that may have summed
nothing.

## Measured, not reasoned

Migration 0020 (the money ledger) added `paid_amount` to every bill read-back,
derived as the sum of allocations from live payments. The first run of
`server/scripts/prove_payments.py` (2026-09-05) went red on two cells and green
on the fifty-six around them:

```
[RED ] Z1: total 0.00, zero payments, zero allocations, status paid (got 201 total=0.00 status=paid)
[RED ] S2: the 201 derives unpaid / 0.00 (got unpaid / 0)
```

Both cells compared the wire string against `"0.00"`. Both bills had NO
allocation — a zero-total bill (no payment is written for it) and a bill
created with the counter separated (no payment yet) — so the SQL summed nothing,
`coalesce` supplied a bare `0`, asyncpg handed back `Decimal('0')`, and
`str()` wrote `0`. Every bill WITH an allocation read `"1.00"`, `"20.00"`,
`"0.30"` correctly, because a sum over at least one `numeric(14, 2)` value
carries that value's scale. The defect is invisible on every paid bill and
appears exactly on the unpaid one.

`payment_status` was right on both cells (`unpaid`, `paid`): the DERIVATION
compared Decimals, where `0 == 0.00`, and only the SERIALISATION was wrong. A
proof that asserted the status and not the string would have been green.

## Why the reader would not have caught it

The phone's money readers (`dailyView.ts` `readMoney`, `sellerHistoryView.ts`)
refuse a JSON NUMBER and accept any STRING. `"0"` is a string. It would have
rendered as `0` beside totals rendered as `1,234.50`, on a screen where the
operator reads a column, and `proveMoney` M5's `stripSeparators(display(x))
=== x` would have held for it. Nothing downstream can tell a
one-decimal-short string from a correct one; the contract has to be kept at
the point where the value is made.

## How to apply

1. Every money value that leaves the server passes through ONE quantizing
   serialiser (`Decimal(v).quantize(Decimal("0.01"))`, weights to three
   places), whether it came from a column or from an aggregate — and
   especially from an aggregate, which is where the scale is lost.
2. A proof of a money endpoint asserts the STRING (`== "0.00"`), never only the
   status or the number the string parses to; and it stages the EMPTY case on
   purpose — the row with nothing to sum — because that is the only row that
   can show this.
3. Ask of any `coalesce(sum(...), 0)`: what does the zero look like on the
   wire? If the answer is "whatever `str()` makes of it", the site is missing
   its quantize.

Sibling of `edge-must-reject-what-the-column-rounds.md` — that one is the
INPUT side of NUMERIC scale (Postgres rounds an over-scale value instead of
refusing it), this is the OUTPUT side (an aggregate drops the scale instead of
carrying it) — and of `decimal-precision-for-domain-scale.md`, where the
library's precision was the thing that did not travel.

**Where measured.** `server/scripts/prove_payments.py` Z1 and S2, first run
2026-09-05 against a scratch restored from the post-0020 dev dump; fixed at
`server/app/bills.py` `_paid_amount` and the bill-list row (both quantize),
after which the same two cells read `"0.00"` and the suite went 59/59 twice.
