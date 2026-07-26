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
