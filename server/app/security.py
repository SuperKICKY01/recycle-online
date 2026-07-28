"""Password hashing (argon2) and JWT issue/verify.

argon2 hashing and verification are CPU-bound, BLOCKING operations. Running
them directly in an async handler would freeze the event loop for every other
request, so they are dispatched to a worker thread via asyncio.to_thread.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import uuid

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from .config import JWT_ALG, JWT_SECRET, JWT_TTL_SECONDS

_ph = PasswordHasher()

# A precomputed hash used to verify against when a user is NOT found, so that a
# missing user and a wrong password take the same amount of work -> no timing
# oracle and no user enumeration.
DUMMY_HASH: str = _ph.hash("password-for-timing-equalisation-only")


def _hash(password: str) -> str:
    return _ph.hash(password)


def _verify(hash_: str, password: str) -> bool:
    try:
        _ph.verify(hash_, password)
        return True
    except (VerifyMismatchError, InvalidHashError, VerificationError):
        return False


async def hash_password(password: str) -> str:
    return await asyncio.to_thread(_hash, password)


async def verify_password(hash_: str, password: str) -> bool:
    return await asyncio.to_thread(_verify, hash_, password)


def create_access_token(
    *, user_id: uuid.UUID, tenant_id: uuid.UUID, username: str, role: str
) -> str:
    """Sign a token. Identity is keyed on the STABLE ids (user_id, tenant_id);
    username travels along only for display, it is not the identity.

    `role` travels the same way: ADVISORY, so a client can render with it (hide
    a void button a staff device may not use) without an extra round trip. It is
    NOT what the server authorises on — get_principal re-reads the role from the
    database under tenant context on every request, so a token minted before a
    demotion cannot outlive it. See the note there.
    """
    now = dt.datetime.now(tz=dt.timezone.utc)
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "username": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + dt.timedelta(seconds=JWT_TTL_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_access_token(token: str) -> dict:
    """Decode + verify. Raises jwt.PyJWTError on tampered/expired/invalid tokens."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
