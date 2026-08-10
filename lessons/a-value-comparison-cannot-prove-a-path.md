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

## AMENDED (2026-08-10) — the same rule where the claim is an EFFECT, and a reason it hides that no input can reach

**The rule above is written about a ROUTE and it is not only about routes.** The
general form is: **the claim is about a BEHAVIOUR, and the assertion you are about
to write is about a VALUE that the behaviour happens to move.** A path is one
instance. Here is another, and it is the one that will recur, because it is the
shape every session-revocation check takes.

**What was measured.** `cb11f6a` added `POST /users/me/password`, which writes the
new hash and bumps `token_version` in ONE statement. `prove_user_create.py`
asserts two things beside each other:

| cell | what it reads | what it can support |
|---|---|---|
| S1's DELTA | the `token_version` in the 200 body, against the version in the token the server had minted | **the column moved** |
| S2 | the pre-change token re-issued at two endpoints, and refused 401 `token_revoked` | **the session died** |

Removing the bump reddened both, five cells in total. **That joint redness is
evidence about the STATEMENT, not about which cell carries the claim.** The delta
would be satisfied by any code that incremented the number — including code whose
guard never compares it, or a route that bumped a different user's row and
reported this one's. It is a shape check standing next to the claim, and it reads
exactly like the claim.

**WHY NO MUTATION CAN SEPARATE THEM HERE, which is the new part.** In the original
case above, an input existed that would have exposed the difference and the proof
simply did not supply it. Here **one statement moves both facts**, so every
mutation that touches the bump moves the proxy and the behaviour together, and no
input, fixture or control inside that proof can tell you which cell you are
relying on. The separation is not discoverable by running the thing — it is
discoverable only by asking what each cell would still detect if the two were
split.

**Nothing shipped wrong, and that is the point.** Both cells were present, so the
route is correct and proven. What the disproof exposed is a failure that has not
happened yet, and **this is the path it will take** — not an illustration of one:

> The next session writes a route that must end a session. It looks for how the
> last one was proven, finds `S1`'s delta, and copies **"assert the version
> moved"** because that is the cell whose claim is easiest to state. It sees the
> token re-issue below it and drops that as redundant — the version moved, so of
> course the session died. **It ships a route whose sessions never die, and a
> proof that is green about it**, and the green is truthful: the number really
> did move.

Nobody has to be careless for that to happen. The delta reads like the claim, it
reddens when the claim breaks in the one case anyone tries, and it is shorter.
**The only thing standing between that path and the tree is the cell labelling
itself**, which is why the labelling is a rule below and not a nicety.

**How to apply.**

1. When two cells would redden from one cause, name which one carries the claim
   and say so **in the cell's own text**, so a reader cannot cite the other.
   S1's delta is labelled a shape check; S2 says it is the cell the disproof
   targets.
2. Ask of any assertion on a number: **if this number moved and the behaviour did
   not, would this cell still pass?** For a version counter read out of a response
   the answer is yes, always.
3. Assert the behaviour by ATTEMPTING it — re-issue the credential and require the
   refusal — and on more than one endpoint, so the refusal is a property of the
   session rather than of one route.
4. A status is not a code. The refusal here must name `token_revoked`, because a
   401 also arrives from a locked account and from a malformed token, and an
   outcome two mechanisms produce is evidence about neither
   (`a-check-that-never-went-red-was-never-observed.md`, seventh mechanism).

**Where recorded.** `PROJECT_STATUS.md § Current phase`, under the disproof, with
the sentence that matters carried in full: nobody should cite the delta as
evidence a session died.
