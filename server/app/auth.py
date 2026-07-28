"""Authentication dependency: resolve the caller's tenant + user from the JWT.

Tenant scoping for data routes comes ONLY from the token. tenant_id is never
read from the URL or body for scoping (login is the sole exception: there the
submitted tenant_id is an identity claim, not a data filter).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, replace

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text

from .db import tenant_connection
from .security import decode_access_token

# auto_error=False -> a missing/blank Authorization header yields None here so we
# raise our own 401 (rather than FastAPI's 403).
_bearer = HTTPBearer(auto_error=False)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


# The only two roles there are. users.role is CHECK-constrained to exactly these
# in migration 0001, so nothing else can be in the database to begin with.
ADMIN_ROLE = "admin"
STAFF_ROLE = "staff"


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    username: str
    # ALWAYS the role read back from the database for THIS request — never the
    # role the token claimed. See the note in get_principal.
    role: str


async def get_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Principal:
    if creds is None or not creds.credentials:
        raise _UNAUTHENTICATED
    try:
        claims = decode_access_token(creds.credentials)
        claimed = Principal(
            user_id=uuid.UUID(claims["sub"]),
            tenant_id=uuid.UUID(claims["tenant_id"]),
            username=claims["username"],
            # REQUIRED, not optional. A token minted before roles existed has no
            # `role` claim -> KeyError -> 401 below, which the mobile client
            # already handles as session_expired ("sign in again"), not as a bill
            # failure (lessons/401-is-about-the-caller-not-the-bill.md).
            # Defaulting it to anything would be a default IDENTITY, which is
            # what lessons/config-defaults-must-fail-closed.md is about.
            role=claims["role"],
        )
    except (jwt.PyJWTError, KeyError, ValueError):
        # Tampered signature, expired, malformed, or missing claims -> all 401.
        raise _UNAUTHENTICATED

    # A VALID SIGNATURE IS NOT PROOF THE USER EXISTS.
    #
    # Without this lookup the claims were taken entirely on faith: a token whose
    # `sub` names no user at all was accepted, and every downstream handler then
    # acted for a principal that does not exist. Two concrete consequences:
    #
    #  - A user deleted or disabled in the back office keeps full access until
    #    their token expires, because nothing ever re-checks them.
    #  - void_bill writes principal.user_id into purchase_bills.voided_by, whose
    #    composite (tenant_id, voided_by) FK then fails -> an unhandled 500 ->
    #    `unavailable` to the client -> that device's send queue dams behind it
    #    (lessons/queue-jam-must-be-visible.md). A nonexistent user could jam a
    #    yard by voiding one bill.
    #
    # Resolved INSIDE the token's tenant context, never by a global lookup, for
    # the same reason login is (lessons/login-resolves-under-tenant.md): RLS makes
    # other tenants' users invisible, so a token pairing a real user_id from
    # tenant A with tenant_id B finds nothing and is rejected.
    #
    # Cost is one short read transaction per authenticated request. That is the
    # honest price of not trusting a bearer token about who exists.
    async with tenant_connection(claimed.tenant_id) as conn:
        row = (
            await conn.execute(
                text("SELECT role FROM users WHERE id = :uid"),
                {"uid": claimed.user_id},
            )
        ).mappings().first()
    if row is None:
        raise _UNAUTHENTICATED

    # THE DATABASE IS THE AUTHORITY ON ROLE, NOT THE CLAIM.
    #
    # The token carries a role so a client can render with it, but authorisation
    # reads the row. The two differ in exactly the case that matters: an admin
    # demoted to staff in the back office still holds a token CLAIMING admin
    # until it expires (JWT_TTL_SECONDS, an hour by default). Gating on the claim
    # would let that phone keep voiding bills for the rest of the hour — the same
    # "a valid signature is not proof" failure as above, one field along.
    #
    # This costs nothing: the lookup that proves the user still exists is already
    # on this path, and it now returns a column instead of a constant.
    return replace(claimed, role=row["role"])


# ---------------------------------------------------------------------------
# AUTHORISATION — a FOURTH answer, and it must not be mistaken for the others
#
# The sync engine already classifies what the server can say about a request
# (mobile/src/adapters/httpTransport.ts, lessons/unavailable-is-not-rejected.md
# and lessons/401-is-about-the-caller-not-the-bill.md):
#
#   422  PERMANENT   — this payload can never be valid   -> terminally failed
#   424  RESOLVABLE  — valid, master data not set up yet -> parked, retried later
#   401  IDENTITY    — the caller is no longer anyone    -> sign in again
#   5xx  UNKNOWN     — answered, but unusably            -> retried forever
#
# A 403 is NONE of those. The payload is fine (not 422). The master data is fine
# (not 424). The caller IS someone (not 401). The server answered definitively,
# so retrying changes nothing (not 5xx). It says: this caller may not do this
# until a HUMAN changes their role — no action by the device can clear it.
#
# Being mistaken for either rejection species would be actively wrong:
#   - as PERMANENT, a void request is discarded and the owner is told the bill is
#     broken, when the bill is fine and the phone simply is not an admin;
#   - as RESOLVABLE, it is parked and retried forever against a role that will
#     never change by itself, and the yard is told to go fix master data.
#
# So it is distinguishable on TWO INDEPENDENT axes, and a client needs only one:
#   - the STATUS. 403 is not 422, not 424, not 401, not 2xx, not 5xx. This axis
#     survives a body that fails to parse at all.
#   - the BODY's `kind`: "forbidden". Not "master_data_missing" (the 424
#     contract in bills.py), and not the bare string or FastAPI error list a 422
#     carries. Nothing string-matches a message — that is the whole point of the
#     server naming its own kind.
#
# 403 AND NOT 404, deliberately. A 404 would make "you lack the role"
# indistinguishable from "no such endpoint" AND from "that row is not in your
# tenant" — and the last of those is a REAL 404 the master-data writes return.
# Collapsing them means a staff phone reports the server as broken and an admin
# in the wrong tenant reports a permissions bug. There is no secret being kept:
# the endpoint list is not confidential, and the caller already knows their own
# role — it is in the token they sent.
# ---------------------------------------------------------------------------


def forbidden(code: str, message: str, **context: object) -> HTTPException:
    """A refusal about WHO IS ASKING, not about the payload."""
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"kind": "forbidden", "code": code, "message": message, **context},
    )


async def require_admin(principal: Principal = Depends(get_principal)) -> Principal:
    """Gate an endpoint on the ADMIN role. Drop-in replacement for get_principal.

    FastAPI caches get_principal within a request, so depending on this does NOT
    buy a second user lookup — the same resolved Principal comes back.
    """
    if principal.role != ADMIN_ROLE:
        raise forbidden(
            "admin_required",
            "ต้องมีสิทธิ์ผู้ดูแลระบบจึงจะทำรายการนี้ได้",
            required_role=ADMIN_ROLE,
            actual_role=principal.role,
        )
    return principal
