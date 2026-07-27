# The BE year comes AFTER the timezone conversion — and an ISO-shaped BE date is a trap

**Rule.** `+543` is applied to a year that has *already* been converted to the
shop's timezone. Never to the year the instant happens to carry. And a Buddhist-era
date is rendered `DD/MM/BBBB`, never in ISO shape.

## Why the order cannot be a matter of taste

Once 543 has been added the value is no longer an instant, so there is no
"convert afterwards" — the operation does not exist. That means "+543 first"
always collapses to "never convert", which is right for most of the day and
wrong for every Bangkok morning before 07:00:

```
stored 2026-12-31T17:30Z  =  2027-01-01 00:30 Bangkok
  convert then +543  ->  01/01/2570     correct
  +543 then convert  ->  31/12/2569     wrong DAY and wrong YEAR
```

2569 there is not cosmetic. The server stamps `be_year 2570` on that bill's
`doc_no` and keys `doc_no_counters` on it, so the screen would name a different
business year than the legal document number does. Both numbers were verified
from real runs: `_be_year` returned 2570 and the mobile formatter returned 2570;
the wrong order returned 2569 on both sides.

**This is why the wrong order is dangerous rather than merely wrong: it is
invisible.** For an ordinary evening — 2026-07-26 22:09 Bangkok — both orders
print `26/07/2569`. Identical. So no spot-check, screenshot or afternoon of
manual testing can find it. It has to be proven *at the boundary*, and the proof
has to show the wrong order's output next to the right one or the case is
vacuous.

## Enforced by the compiler, not by a comment

`shopWallClock()` returns a *branded* `ShopWallClock`, and the private `beYear()`
takes only that type. Handing it a raw `new Date(iso)` does not compile:

```
error TS2345: Argument of type 'Date' is not assignable to parameter of
type 'ShopWallClock'. Property '__brand' is missing in type 'Date'.
```

A comment saying "convert first" is a note to whoever reads it. This is a rule
the build enforces on whoever doesn't — the same reasoning as
[[unavailable-is-not-rejected]]: put it in the type or the module boundary, not
in someone's memory. There is exactly ONE `+ BE_YEAR_OFFSET` on the client.

## Why DD/MM/BBBB and not ISO-style 2569-07-26

ISO shape looks like the safer, sortable choice. It is the more dangerous one:
`2569-07-26` is byte-for-byte the shape of a Gregorian ISO date, so it invites
the exact operation [[render-in-shop-time-not-device-time]] exists to kill — a
later `slice(0, 4)` or `new Date(s)` — and would then yield a year wrong by 543
with no visible symptom. `26/07/2569` cannot be mistaken for a machine-readable
instant by a human or by code.

The sortability argument was checked rather than assumed and does not apply: the
one sort in the app orders raw `created_at`, never rendered output. Never
abbreviate to `69`.

## The agreement has a real BOUND — don't "fix" it

The card's date and its `doc_no` year agree only when a bill is **received in the
shop year it was weighed in**. `created_at` is the weighing instant;
`be_year` derives from `server_received_at`, because doc_no is arrival order
([[doc-no-is-arrival-order-not-event-time]]). So a bill weighed 23:59 on 31 Dec
and synced after midnight legitimately shows `31/12/2569` beside `B-2570-n`.

That looks like the bug this lesson is about and is not. Deriving the *displayed*
date from `server_received_at` to make them match would relabel which day the
shop bought a load on — for every offline bill, not just at new year.

## How to apply

1. Shop timezone first, `+543` second. One year source, ideally typed shut.
2. BE dates are `DD/MM/BBBB`, display-only. Storage and the wire stay UTC ISO.
3. Prove it at the boundary AND show the wrong order's output. A green afternoon
   case proves nothing here — the two orders agree there.
4. Assert the UI year against the server's `be_year`, and assert that the wrong
   order would have *disagreed*, or the check does not discriminate.
5. Never let a rendered BE string be parsed, sorted, compared or stored.

**Where proven.** `mobile/src/proof/proveTime.ts` T7–T10: the reported card, the
order disproof over four instants (including the one where both orders agree),
UI↔`doc_no` agreement plus its wrong-order disproof, and negative assertions that
no `19xx/20xx` year survives into rendered output. Run twice under
`TZ=Asia/Bangkok` and `TZ=UTC` with identical rendered values. Server side,
`server/scripts/prove_shop_time.py` S1/S2 for `_be_year`, S3 for the wiring into
`doc_no` and the counter key.
