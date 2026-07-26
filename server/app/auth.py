"""Authentication dependency: resolve the caller's tenant + user from the JWT.

Tenant scoping for data routes comes ONLY from the token. tenant_id is never
read from the URL or body for scoping (login is the sole exception: there the
submitted tenant_id is an identity claim, not a data filter).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

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


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    username: str


async def get_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Principal:
    if creds is None or not creds.credentials:
        raise _UNAUTHENTICATED
    try:
        claims = decode_access_token(creds.credentials)
        principal = Principal(
            user_id=uuid.UUID(claims["sub"]),
            tenant_id=uuid.UUID(claims["tenant_id"]),
            username=claims["username"],
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
    async with tenant_connection(principal.tenant_id) as conn:
        row = (
            await conn.execute(
                text("SELECT 1 FROM users WHERE id = :uid"),
                {"uid": principal.user_id},
            )
        ).first()
    if row is None:
        raise _UNAUTHENTICATED
    return principal
