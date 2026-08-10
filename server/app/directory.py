"""The shop-code lookup: the one endpoint that runs BEFORE any principal exists.

Implements D4 in `ARCHITECTURE.md § 10. The three settled decisions`. Read that
first; this file does not restate the reasoning, only what the reasoning forces.

WHY THIS IS ITS OWN MODULE RATHER THAN A THIRD HANDLER IN main.py. D4's whole
content is that resolving a code is SEPARATE from logging in. Putting the two in
one file would blur exactly the boundary the decision draws, and the boundary is
the security property: login sets tenant context from a submitted value BEFORE
its user lookup runs, so RLS filters that lookup; this endpoint runs before any
tenant is known and therefore sits outside that protection by construction.

WHAT CONTAINS THIS ENDPOINT IS THE GRANT, NOT A POLICY. It reads through
`directory_connection()`, which is bound to `recycle_directory` -- a role holding
SELECT on exactly one relation and no privilege on any relation in schema
`public`. There is no RLS policy on `directory.shop_codes` and there deliberately
cannot be one: the question this relation answers is "which tenant?", so a
tenant-filtered read of it would be readable exactly when it is useless.

ONE REFUSAL, RAISED FROM ONE OBJECT. Unknown code, malformed code, over-long
input: all three raise the SAME module-level exception, so the bodies are
identical by construction rather than by two authors keeping two strings in step.
The reason is enumeration -- the caller holds no credential and has not claimed
to be anyone, so a refusal that distinguishes cases is a free oracle over the
shop directory: "does this code name a real shop?", answered for anyone who can
reach it.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text

from .db import directory_connection

router = APIRouter()

# THE ONLY REFUSAL THIS MODULE HAS. One object, three raise sites, so the three
# bodies cannot drift apart. 404 rather than 422: a well-formed request asking
# about a code that does not resolve is a miss, not a protocol error, and a
# distinct status for the malformed case is precisely the oracle D4 refuses.
_UNKNOWN_SHOP_CODE = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="unknown shop code"
)

# A bound on what reaches the database from an UNAUTHENTICATED caller. Nothing
# about the shape of a code -- `ck_shop_code` already guarantees no stored code
# is longer than 8 -- only a ceiling so an unbounded string cannot be shipped to
# Postgres by anyone who can reach this route. It raises the SAME refusal, so it
# is not distinguishable from a miss.
_MAX_CODE_LEN = 64


class ShopCodeRequest(BaseModel):
    """Deliberately an unconstrained `str`.

    NO pattern, NO min_length, NO max_length -- and that is the security choice,
    not laziness. A `StringConstraints(pattern=...)` here would make pydantic
    answer a malformed code with FastAPI's 422 while the handler answers an
    unknown one with 404, and those two responses differing IS the oracle D4
    exists to close. The shape check would also buy nothing: `ck_shop_code`
    guarantees every stored code matches `^[A-HJKMNP-Z2-9]{8}$`, so a malformed
    code cannot match a row no matter how far it travels.
    """

    code: str


class ShopCodeResponse(BaseModel):
    """The identifier and nothing else.

    Declared as a response_model so FastAPI STRIPS anything a future handler
    returns beyond this field, rather than relying on the handler to stay
    disciplined. What is deliberately absent: the shop's name (the relation has
    no name column, and 0009 argues at length that adding one would make every
    shop's trading name enumerable to anyone who can reach this lookup); any
    onboarding timestamp (same audience, and it would date every shop); and an
    echo of the submitted code (it would tell a caller nothing it did not just
    send, while giving a hit a different body SHAPE from a miss).
    """

    tenant_id: uuid.UUID


@router.post("/auth/shop-code", response_model=ShopCodeResponse)
async def resolve_shop_code(body: ShopCodeRequest) -> ShopCodeResponse:
    """Resolve a human-typed shop code to a tenant_id. Unauthenticated.

    NO SHAPE VALIDATION BEFORE THE QUERY, and the login handler's timing argument
    is why this is not an oversight. `main.py:137-138` verifies against DUMMY_HASH
    when no user is found, so a missing user and a wrong password cost the same
    argon2 work -- there, the asymmetry would have revealed whether a USERNAME
    EXISTS, which the caller does not already know.

    THE SAME ARGUMENT DOES NOT REACH THE SAME CONCLUSION HERE, and the difference
    is what the asymmetry would reveal. Rejecting a malformed code without a
    round trip is faster than querying for an absent one, but the only thing that
    separates is well-formed from malformed -- a property of the string the
    CALLER JUST CONSTRUCTED and therefore already knows. It does not separate a
    code that exists from one that does not, which is the oracle that matters,
    and both of those take the identical path through the identical query.

    So the shape check is omitted for a better reason than timing: it would be a
    second refusal path, and one refusal path cannot disagree with itself.

    Every reference is schema-qualified, per 0009's own rule. The role's
    search_path names `directory`, so the bare name would resolve -- qualifying
    it anyway means the statement does not depend on a role setting that lives in
    a bootstrap script two files away.
    """
    if len(body.code) > _MAX_CODE_LEN:
        raise _UNKNOWN_SHOP_CODE

    async with directory_connection() as conn:
        row = (
            await conn.execute(
                text(
                    "SELECT tenant_id FROM directory.shop_codes WHERE code = :c"
                ),
                {"c": body.code},
            )
        ).mappings().first()

    if row is None:
        raise _UNKNOWN_SHOP_CODE
    return ShopCodeResponse(tenant_id=row["tenant_id"])
