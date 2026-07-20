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
        return Principal(
            user_id=uuid.UUID(claims["sub"]),
            tenant_id=uuid.UUID(claims["tenant_id"]),
            username=claims["username"],
        )
    except (jwt.PyJWTError, KeyError, ValueError):
        # Tampered signature, expired, malformed, or missing claims -> all 401.
        raise _UNAUTHENTICATED
