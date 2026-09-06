# A disproof that opens a gate must still produce a body that parses

**Applies to** every negative test whose fixture deliberately turns a GATED
capability ON to prove the gate — a money-visibility gate, a permission gate, a
feature switch — and especially to the moment you add a REQUIRED field behind that
gate.

## The rule

A disproof isolates ONE variable: it corrupts exactly the thing under test and
leaves everything else valid, so the one cell it targets reddens and no other.
When you add a required field behind a gate, every fixture that OPENS the gate must
now carry that field — and that includes a disproof built to open the gate WRONGLY.
Miss it there and the flipped body no longer parses; the reader refuses the WHOLE
response, and the disproof reddens the parse cells too, not the gate cell it was
aimed at. It still exits red, so a glance says "the break works" — but it now proves
"a malformed body refuses", which is not the claim. The control that catches this is
the COUNT: each break reddens EXACTLY one named cell.

## Measured, not reasoned

The cashier-counter unit added `paid_amount`/`payment_status` to the seller-history
wire, REQUIRED whenever `money_included` is true (the reader refuses a money-shown
body without them, the sibling of
[[a-new-required-field-refuses-every-queued-payload]] on the READ side).
`prove:sellerhistory`'s `money_when_hidden` break flips a money-HIDDEN fixture's
`money_included` to true, to show the money-absent cell reddens when money wrongly
appears. That flipped fixture supplied a total and a unit_price but NOT the two new
keys, so the reader refused it, the screen became a message, and the break reddened
TWO cells — the gate cell AND "the non-money facts are still drawn" — where the
discipline is exactly one. Measured before the fix: `fails=2`. The fix gave the
flipped fixture the WHOLE money shape (total, `paid_amount`, `payment_status`) so it
READS, after which only the gate cell reddens: `fails=1`.

## Why the green run did not catch it

The MAIN run (money hidden, no break) never sends the new keys and never needs
them — every main cell stayed green. The defect lived only in the BREAK, and a
break is asserted by "it reddens", which it did. Only the stricter control — that it
reddens exactly ONE named cell — could see that it now reddened for the wrong
reason. A break checked by "exit != 0" is a break you have not observed;
[[a-check-that-never-went-red-was-never-observed]] read from the other side.

## How to apply

1. When you add a required field behind a gate, list every fixture that turns the
   gate ON — including the disproofs — and give each the complete new shape.
2. Keep a per-break control that counts cells: each break reddens EXACTLY one, by
   name. "Exit 1" is not that control.
3. A disproof that fails to parse has stopped testing its variable and started
   testing the parser. Read WHICH cell reddened, never only THAT one did.

**Where measured.** `mobile/src/proof/proveSellerHistory.ts` `money_when_hidden`,
2026-09-06: `fails=2` before the flipped fixture carried `paid_amount`/
`payment_status`, `fails=1` after (the other three breaks unchanged at 1 each).

## Related

[[a-new-required-field-refuses-every-queued-payload]] — the same "a new required
field refuses" mechanism on the production write path; here it refuses a proof
fixture instead of a queued bill.
[[a-check-that-never-went-red-was-never-observed]] — a red you did not read is a red
you did not observe; the one-cell-per-break count is what reads it.
[[a-control-must-contain-what-fooled-you]] — the break must reproduce the ONE thing
under test and nothing else.
