# A value comparison cannot prove a PATH

**Applies** to every test whose claim is that data FLOWED from one place to
another — a response feeding the next request, a column reaching a screen, a
config value arriving at a driver, an id carried across a queue. The claim is
about a route. Every assertion you are about to write is about a value.

**The rule.** If the value at the end is correct, no comparison of values can
tell you it travelled. A correct hardcode and a genuinely carried value are the
same bytes, and equality cannot see the difference between them. To assert a
path you need PROVENANCE, which is a property of the object rather than of its
contents.

## What was measured, 2026-08-10

`prove_shop_code.py` claims a chain: `POST /auth/shop-code` returns a tenant
identifier, and THAT identifier is used to log in. The proof asserted it three
ways — the login succeeded, a token came back, and `GET /whoami` reported the
same tenant the resolve had returned.

The chain was then broken on purpose: the login was rewired to a hardcoded
literal instead of the resolve's response. **Every assertion still passed and the
run exited 0**, including the `/whoami` cross-check, which is the one that looks
like it closes the loop.

It could not have failed. The literal was the right uuid, so:

| assertion | with the chain | with a correct hardcode |
|---|---|---|
| login returns 200 | pass | pass |
| a token comes back | pass | pass |
| `/whoami` reports the resolved tenant | pass | **pass** |

## Why the obvious fixes do not work

- **"Compare against what A1 returned."** That is the `/whoami` check. It passed.
- **"Derive both sides instead of hardcoding one."** Both sides WERE derived from
  live responses — this is exactly the remedy
  `a-differential-control-is-only-as-good-as-its-weaker-side.md` prescribes, and
  it is not sufficient here, because the defect is not a literal on one side of a
  comparison. It is that the comparison is about values at all.
- **"Supply an input that could fail."** There is none. Any input that changes
  the expected tenant changes it on BOTH sides at once, because the server
  answers from the same fixture.

## What does work

**Carry provenance in the TYPE, and assert the type.**

```python
class ResolvedTenant(str):        # a str subclass: the wire is unchanged
    __slots__ = ()

resolved = ResolvedTenant(r1.json()["tenant_id"])   # only A1 constructs it
body = {"tenant_id": resolved, ...}
check(isinstance(body["tenant_id"], ResolvedTenant))
```

A literal is a plain `str` and fails before a request is sent. With the break in
place and this check present, exactly one cell reddened.

**ASSERT ON THE OBJECT THAT IS ACTUALLY USED, NOT ON THE ONE YOU PARSED.** The
first version checked the parsed variable, which stays correctly typed while a
hardcoded literal sits in the request beside it — green against the exact break
it existed to catch. The gate belongs on the value at the point of USE.

## The limit, which must travel with the technique

This proves the value FLOWED through this process. It does not stop an author who
writes `ResolvedTenant("1111-...")` by hand. It catches the accidental break and
the lazy one — which is what a regression looks like — and is not a defence
against a deliberate forgery. Anyone citing it for more than that is overclaiming.

## Where this sits

Extension of `a-differential-control-is-only-as-good-as-its-weaker-side.md`, not
a restatement: that one says a comparison is worthless when one side is a
literal, and prescribes deriving both. Here both sides were derived and the
comparison was still worthless, because **derivation makes a value trustworthy
and still says nothing about the ROUTE it took.** Related to the second mechanism
of `a-check-that-never-went-red-was-never-observed.md` — the failing state
unreachable from the inputs supplied — with the sharper case that here no input
exists that could reach it.

Ask, of any test that claims a chain: **what would this run do differently if I
pasted the expected value in by hand?** If the answer is "nothing", it is not
testing a chain.
