# A proof must establish WHAT IT IS TALKING TO before it asserts anything about the answers

**Applies** to every check that reaches something over a socket, a port, a
connection string, a queue or a path — and hardest to REFUSAL assertions, which
are the ones a wrong responder can satisfy for free.

**The rule.** Liveness is not identity. A 200 from `/health` proves *something*
is there; it does not prove it is the thing under test. Ask the responder to
identify itself — its own schema, its own version, its own build — and require
the answer to name the thing you are about to assert about. Identity first,
behaviour second.

## What happened, measured 2026-08-10

`prove_shop_code.py` started its own uvicorn on a hardcoded port 8137, polled
`/health` until 200, then asserted. On that port a uvicorn pair had been serving
this repository's API **since 2026-08-07**, running code that predated the
endpoint under test. The child could not bind and exited; the health poll was
answered by the OTHER server; and:

| assertion | outcome | why |
|---|---|---|
| P1 — a real code returns 200 with a tenant_id | **RED** | correct |
| P2 — an absent code is refused 404 | **GREEN** | the route did not exist |
| P3 — a malformed code is refused identically to P2 | **GREEN** | both were the same routing 404 |

**Two of the three refusal assertions passed against a route that did not
exist.** The only thing that failed was the positive assertion.

## The part that generalises, and it is uncomfortable

**The better the refusal was designed, the more satisfiable it became by
absence.** D4 required this endpoint to refuse identically whatever the cause, so
the refusal is deliberately generic and minimal: `404` with a one-key
`{"detail": ...}` body. **Starlette's default for an unrouted path is `404` with a
one-key `{"detail": "Not Found"}` body.** A well-designed generic refusal
CONVERGES on the framework's default refusal, so an assertion written to check
for it is satisfied by the endpoint's absence.

**Positive and negative assertions are not equally safe, and this is why.** You
cannot return the correct tenant_id by accident — P1 is self-validating, because
only the system under test can produce that value. A refusal carries no such
payload: *any* system can produce a 404. So a suite whose positive cells are its
weakest-looking and whose negative cells are its most careful will fail in
exactly the observed pattern — the careful cells green, the naive cell red.

## What to do

- **Ask for identity before asserting.** Here: fetch `/openapi.json` and require
  `/auth/shop-code` to be declared. A server that does not declare the path is
  not the server this proof is about, and the run stops before any cell is read.
- **Pin a refusal assertion to YOUR refusal, never to the status.** `404` is
  shared with the framework; `detail == "unknown shop code"` is not. Deleting the
  route now reddens P2 instead of greening it.
- **Do not hardcode a port.** Bind `:0`, read the port back, use that. A fixed
  port is a shared global on a developer's machine, and the collision is silent.
- **Watch the child, not just the clock.** If the process you started has exited,
  fail immediately and print its output. Waiting out a 45-second timeout and then
  blaming the timeout hides that the child died in the first second.
- **Ask what ELSE could answer this.** A database connection can reach a
  restored copy; a queue consumer can be a stale deployment; a file path can be a
  symlink to last week. The question is not "did I get a response" but "could
  anything other than the thing under test have produced this response".

## Where this sits

Sibling of `a-check-that-never-went-red-was-never-observed.md`, and specifically
of its FIFTH mechanism — there the instrument never read the artifact, here it
read a DIFFERENT ONE whose answers are shaped like the right ones. The
distinction is worth keeping: mechanism five is fixed by pointing the instrument
at the right file, and no in-run control catches it. This one IS catchable in the
run, by one request, and the fix is cheap enough that there is no excuse for
omitting it.

Also related to `a-differential-control-is-only-as-good-as-its-weaker-side.md`:
P3 compares two responses and requires them to be IDENTICAL. Two responses from
the wrong server are identical to each other, so that comparison held perfectly
while measuring nothing. A sameness assertion is only as good as the proof that
both sides came from the right place.
