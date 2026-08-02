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

## AMENDED (2026-07-29): this lesson was written for production code, and the tests were never swept

Everything above was applied to `app/bills.py` and `shopTime.ts` when the defect
was found, and it held. Then, eight months later, the SAME expression was found
alive in three places in two proof scripts:

```python
prove_bills.py:35            BE_YEAR = datetime.now(tz=timezone.utc).year + 543
prove_master_data_gate.py    be_year = 2569   (two SQL predicates, one doc_no regex)
```

Nobody wrote a new bug. **The fix was applied to the site that had failed, and no
one asked where else the same computation lives.** `prove_backup_restore.py` had
imported `_be_year` all along with the note *"one BE-year source; never re-derive
+543"* — so one proof had it right and two did not, which is exactly the shape of
a rule that was communicated by fixing rather than by sweeping.

**What it would have cost.** Nothing, until 2027-01-01. Then, for the seven hours
between Bangkok midnight and 07:00 UTC, `prove_bills` would compute 2569 while
the server stamped 2570, and go red — on new year's day, with nobody having
touched the repository, over a defect the code does not have. A proof that fails
for a reason unrelated to the behaviour it tests is worse than no proof: it
teaches the next person that red means "look at the environment", which is the
belief that lets a real red through.

**The general form, and it is not about dates.** When a lesson fixes a
computation, the sweep is not done until every OTHER site of that computation has
been checked — **tests included**. Test code is the easiest place for the old
expression to survive: it is written to be independent of the implementation,
which is precisely what makes it re-derive the thing the implementation now owns.
"Independent reimplementation" is a virtue in an oracle only when the rule it
encodes is stable; for a rule that was just corrected, it is a copy of the bug
with a longer fuse.

So the closing step of any fix of this kind is a repo-wide grep for the
*expression*, not for the symptom — here `+ 543`, `.year`, a hardcoded `2569`, a
date literal in SQL, any UTC-based date arithmetic — across production code,
proofs, fakes and fixtures. That sweep was done on 2026-07-29 and the rest of the
repo is clean; what it found and why each surviving site is sound is recorded in
PROJECT_STATUS under that date.

Two sound-looking things it deliberately did NOT change, so the next sweep does
not churn them:

- **Fixed input → fixed expected** pairs (`proveTime.ts`, `proveClock.ts`): an
  assertion like `shopDate("2027-01-01T00:30:00Z") === "01/01/2570"` is a
  constant mapping and is correct forever. Only a *derivation from the current
  clock* is a time bomb.
- **Fake servers that emit `B-2569-n`** (`fakes.ts`, `fileServer.ts`): the year
  there is frozen deliberately. Making the fake derive the real year would add a
  clock dependency to tests that are currently deterministic, and nothing
  compares the fake's doc_no against a computed year — `doc_no` is an identifier,
  never a date ([[doc-no-is-arrival-order-not-event-time]]).

## AMENDED AGAIN (2026-08-02): the function was right — the INSTANT passed to it was wrong

Everything above is about the ORDER OF OPERATIONS inside the derivation. This one
got the derivation perfectly right and still put the wrong year on a legal
document, because of the ARGUMENT:

```python
be_year = _be_year(datetime.now(tz=timezone.utc))   # a SECOND clock, a SECOND moment
...
INSERT INTO purchase_bills (...)                     # server_received_at DEFAULT now()
```

`server_received_at` is Postgres' `now()` — **transaction start**. The `be_year`
came from a PYTHON read taken later in the same transaction, after the seller
lookup and every product and price lookup. Two clocks *and* two moments, a full
master-data round-trip apart. A submit beginning at 23:59:59.9 on 31 December
shop time and reaching that line after midnight took NEXT year's `be_year` on
LAST year's stamp.

**It was not a mislabel.** `doc_no_counters` is keyed on `(tenant_id, be_year)`,
so the bill OPENED THE WRONG COUNTER a year early. The new year's real first bill
then finds it at 1 and becomes `B-<year>-2`, and no `B-<year>-1` will ever exist:
a permanent gap in a document sequence, unrepairable, in the one table hard rule
5 forbids editing.

Measured before and after on the real `create_bill`, same lie, scratch copy:

| | doc_no | server_received_at | doc_no_counters |
|---|---|---|---|
| before | `B-2570-1` | BE 2569 | `{2569: 305, **2570: 1**}` |
| after | `B-2569-306` | BE 2569 | `{2569: 306}` |

**The rule this adds:** a value DERIVED from a timestamp must be derived from the
timestamp that is actually STORED — read once, then used for both. Never from a
fresh read of "the same kind of thing", however close the two look. `now()` and
`datetime.now()` are not the same clock, and even one clock read twice is not one
moment.

**And the fix is an ORDERING, never a tolerance.** The instinct is to allow a few
seconds of slack between the two reads. That leaves two reads. The instant is now
read FIRST, `be_year` is derived from it, and the SAME value is written to
`server_received_at` explicitly instead of leaving it to the column default —
because "they agree because both call `now()`" is a coupling the next reader has
to already know in order to see. One value, used twice, no window to be tolerant
about.

**Where proven.** `server/scripts/prove_docno_clock.py` — C1 puts the two
instants a straddling transaction really produces through the real `_be_year`
(150 ms apart, one BE year apart); C2 lies to Python's clock across new year and
drives the real `create_bill`, asserting the doc_no year, the counter key and the
stamp all agree and that no counter opened for the lied-about year. It refuses to
run against the live database, because against unfixed code the lie is itself the
corruption.

## How to apply

1. Shop timezone first, `+543` second. One year source, ideally typed shut.
2. BE dates are `DD/MM/BBBB`, display-only. Storage and the wire stay UTC ISO.
3. Prove it at the boundary AND show the wrong order's output. A green afternoon
   case proves nothing here — the two orders agree there.
4. Assert the UI year against the server's `be_year`, and assert that the wrong
   order would have *disagreed*, or the check does not discriminate.
5. Never let a rendered BE string be parsed, sorted, compared or stored.
6. When you fix one of these, grep the WHOLE repo for the expression before
   closing it out — production, proofs, fakes, fixtures. The fix is not the
   sweep, and the site that failed is rarely the only one.

**Where proven.** `mobile/src/proof/proveTime.ts` T7–T10: the reported card, the
order disproof over four instants (including the one where both orders agree),
UI↔`doc_no` agreement plus its wrong-order disproof, and negative assertions that
no `19xx/20xx` year survives into rendered output. Run twice under
`TZ=Asia/Bangkok` and `TZ=UTC` with identical rendered values. Server side,
`server/scripts/prove_shop_time.py` S1/S2 for `_be_year`, S3 for the wiring into
`doc_no` and the counter key.
