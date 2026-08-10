# A 422 is a MIRROR — the framework hands back the value it refused, and one of those values is a password

**Rule.** Before constraining a field at the edge, ask what the REFUSAL returns.
FastAPI's default validation handler serialises pydantic's `input`, so the value
that failed comes back to the caller inside the error body. That is harmless for
a product code and it is a credential disclosure for a password.

## Measured, not reasoned

`POST /users` (`server/app/users.py`) declares `min_length=8` on `password`, at
the edge, exactly as [[edge-must-reject-what-the-column-rounds]] prescribes and
exactly as `master.py` constrains its own fields. Sending a seven-character
password returns:

```
422 {"detail":[{"type":"string_too_short","loc":["body","password"],
     "msg":"String should have at least 8 characters",
     "input":"abc1234","ctx":{"min_length":8}}]}
```

`"input":"abc1234"` is the password. Nothing in the route put it there and no
line of this repository asked for it: it is what `RequestValidationError` carries
and what the default handler prints. The same run shows the same mechanism on a
different rule — an `extra_forbidden` refusal echoes the rejected field's value
too (`"input":"22222222-2222-..."`, a tenant id).

**The disclosure is to the caller who sent it**, which is why this is a hazard
rather than a breach: the admin already knows the password they just typed. What
travels further is the BODY. This project has already shipped a screen that
rendered a raw server error body verbatim, with a seller uuid in it, and the
lesson is [[correct-classification-can-still-render-as-an-error]]. A client that
does that with this body puts a colleague's new password on a screen at a
weighbridge.

## Why no assertion caught it, and this is the part that generalises

The create proof asserts, by name and on the raw bytes, that the SUCCESS body
carries no `password`, no `password_hash` and no `token_version`. All three cells
are green and all three are about the 201.

**Absence assertions get written on the success path. The disclosure was on the
refusal path.** A refusal is where a proof asserts a status and a `code`, because
that is what the contract says; the body of a refusal is the thing nobody reads
back. Every route in this API that constrains a field at the edge has a refusal
shaped by the framework rather than by this repository, and not one of them has
ever been asserted on for what it contains.

Related in mechanism and opposite in direction to
[[a-check-that-never-went-red-was-never-observed]]'s ninth: there an ABSENCE cell
passed over an empty haystack; here the absence cells were sharp, well-controlled
and pointed at the wrong response.

## The state this was left in

**Recorded, not fixed.** The route ships with the echo. Fixing it means a
`RequestValidationError` handler for the whole API that redacts `input` — a
change to every endpoint's refusal shape, which is not a thing to slip into the
commit that found it. The proof prints the echo as a labelled OBSERVATION rather
than a cell, because no contract in this repository says the body must not carry
it, and a cell asserting a decision nobody has taken is a cell that fails for
being right too early.

## How to apply

1. When you add a constraint to a field at the edge, send a value that VIOLATES
   it and read the whole refusal body. Not the status, not the `code` — the body.
2. Ask of that body: would I be willing to print this on a screen, or write it to
   a log? If the field is a credential, a token, or anything that identifies a
   person, the answer decides whether the constraint may live at the edge as
   declared or needs a validator that refuses without quoting.
3. **The next two password routes are the reason this file exists.**
   `ARCHITECTURE.md § 10. The three settled decisions` D6 is three routes and two
   of them take a password. Both will constrain it the same way, and both will
   echo it on the same path, unless this is remembered when they are written.
4. Where a proof asserts a body's contents, write the sibling assertion on the
   REFUSAL body in the same run. A response nobody read back is a response nobody
   knows the shape of.

**Where measured.** `server/scripts/prove_user_create.py` P6, against
`recycle_restore_scratch`, 2026-08-10 — printed as
`the 422 body ECHOES the rejected password: True`, and repeated in that run's
summary so an observation nobody reads cannot be how it stays.

## AMENDED (2026-08-10) — it is fixed, ONE COMMIT after this file was written

**"The state this was left in" above is history now, and it is kept rather than
edited because the ORDER is the part worth keeping.** The section said the route
ships with the echo and that fixing it means a handler for the whole API. That is
exactly what was then built: `server/app/main.py::validation_error_handler`,
registered against `RequestValidationError` on the app, removing pydantic's
`input` from every validation error this API emits.

**WHY IT COULD NOT WAIT FOR THE ROUTES THAT MADE IT URGENT.** The next phase is
D6's two password routes, and each carries TWO secrets in one request — the
password in use and its replacement. Fixing the echo at those routes would have
produced an API that is safe where somebody remembered and leaks where nobody
did, while `POST /users` went on leaking regardless. A defect whose fix is a
shared handler is fixed at the handler, before the callers that need it, or it
is fixed once per author for ever.

**ONE KEY, UNCONDITIONALLY — NOT A LIST OF SECRET-ISH FIELD NAMES.** `password`,
`new_password`, `pin`, `secret`, `token` is the author guessing at what a thing
may be CALLED ([[a-gate-that-matches-a-keyword-misses-its-aliases]]), and it
fails in the permissive direction: the field nobody thought of is the field that
leaks. Removing `input` from every error object means there is nothing to
classify, so a route written next year is covered by a decision taken today.
Measured on a NON-SECRET field in the same run, because a rule you cannot see
working on an ordinary field is a rule you have not tested.

**WHAT THE 422 STILL CARRIES, because the opposite mistake was available and is
worse:** `detail` is still a LIST, and each error keeps `type`, `loc`, `msg` and
`ctx` — which field, in what way, against what bound. A handler that made every
validation error uninformative would have traded one defect for a bigger one,
and the shape is load-bearing elsewhere: `prove_master_write.py` tells a pydantic
422 from this API's kind/code refusals by the fact that it carries a list and no
`kind`.

**THE RESIDUAL IS UNCHANGED AND NO HANDLER CAN REACH IT.** A custom validator
that interpolates the rejected value into its own message still echoes it through
`msg`, because that text is the author's and nothing can tell it from a
legitimate sentence. Every constraint in this API is declarative today, so no
such message exists. **Rule 2 of "How to apply" above therefore still stands
unchanged** — read the whole refusal body when you add a constraint — and rule 3
is what the handler discharged.

**Where measured.** `prove_user_create.py` P6/H4 asserts the password's absence
on the RAW BYTES with a presence sibling in the same response; H1-H3 show the
removal is API-wide, H3 on `POST /uoms`, a route with nothing to do with
passwords. 83 cells, 0 failures, twice in a row with no reseed. **De-registering
the handler turns exactly six cells red** — H4, two of H1's, two of H2's and one
of H3's — while every cell asserting that the error still NAMES the field and the
reason stays green. That pairing is the evidence: the informativeness cells are
pointed at informativeness, not at the handler's existence.
