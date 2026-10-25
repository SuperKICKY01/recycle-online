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

## AMENDED (M2, 2026-10-25) -- the flag that names a default must be keyed to the VALUE, not to the arm

Where a default cannot be avoided, it is made honest by a flag. The sale cost rule (`app/stock_cost.py`) answers
0.0000 for a product never bought (arm `none`), and the sale was flagged `no_cost` -- ON THAT ARM. But stock can
also enter at 0.00 by a counted adjustment of a never-bought product (the adjustment is valued at the product's
current cost, which is that same invented 0); the next sale then takes the AVERAGE arm over a ledger worth 0.00 and
answers 0.0000 again, unflagged, storing a gross profit equal to the whole sale -- for ever, since a sale line is
never re-costed (hard rule 6). The red team found it by asking which other path produces the invented value.

The rule: a flag (or a refusal) for an invented value tests the VALUE (`cost_per_unit == 0`), never the branch that
happened to produce it first; ask what else can produce that value. The fix flags it whatever the arm (`prove_sales`
SC14.1, disproved by restoring the arm test). What a cost for such stock SHOULD be is the owner's decision, not a
default -- `OPEN_ITEMS.md § Decisions open`, "WHAT DOES STOCK THAT ENTERED WITHOUT A PURCHASE COST?".
