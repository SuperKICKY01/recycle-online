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
