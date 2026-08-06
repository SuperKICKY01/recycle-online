"""FastAPI app for Phase 1b: login, whoami probe, health.

No bill or master-data endpoints yet — this phase exists only to prove the
per-request tenant-context layer over real HTTP.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from .auth import Principal, get_principal
from .bills import router as bills_router
from .db import engine, tenant_connection
from .master import router as master_router
from .reports import router as reports_router
from .security import DUMMY_HASH, create_access_token, verify_password
from .users import router as users_router


class LoginRequest(BaseModel):
    tenant_id: uuid.UUID
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="Recycle Online API (Phase 2c-2)", lifespan=lifespan)
app.include_router(bills_router)
app.include_router(master_router)
app.include_router(reports_router)
app.include_router(users_router)

_INVALID_LOGIN = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials"
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    # Tenant context is set from the SUBMITTED tenant_id (an identity claim).
    # RLS then guarantees the lookup can only ever see THAT tenant's users, so a
    # username belonging to another tenant is simply invisible here -> there is
    # no cross-tenant login path.
    async with tenant_connection(body.tenant_id) as conn:
        row = (
            await conn.execute(
                text(
                    "SELECT id, tenant_id, username, role, token_version,"
                    " password_hash FROM users WHERE username = :u"
                ),
                {"u": body.username},
            )
        ).mappings().first()

    if row is None:
        # Equalise timing with the found-user path; never reveal user existence.
        await verify_password(DUMMY_HASH, body.password)
        raise _INVALID_LOGIN
    if not await verify_password(row["password_hash"], body.password):
        raise _INVALID_LOGIN

    token = create_access_token(
        user_id=row["id"],
        tenant_id=row["tenant_id"],
        username=row["username"],
        role=row["role"],
        # Read in the SAME statement as the password hash, so the version minted
        # is the version that existed at the moment the credentials were checked
        # — one read, one snapshot, no second lookup to drift.
        #
        # A bump landing after that statement and before this token is first
        # used makes the new token stale on its first request; the caller signs
        # in again and the second token is current. Unavoidable in any
        # issue-then-check scheme, and it fails CLOSED, which is the direction
        # that matters. See the window note in auth.get_principal.
        token_version=row["token_version"],
    )
    return LoginResponse(access_token=token)


async def get_authed_conn(principal: Principal = Depends(get_principal)):
    """A DB connection whose transaction is scoped to the TOKEN's tenant."""
    async with tenant_connection(principal.tenant_id) as conn:
        yield conn


@app.get("/whoami")
async def whoami(
    principal: Principal = Depends(get_principal),
    conn: AsyncConnection = Depends(get_authed_conn),
) -> dict:
    # Read back the context the server actually applied for THIS request, and
    # confirm the token's user is visible under it. If SET LOCAL had not been
    # applied (or applied wrongly), user_visible_under_tenant would be false.
    db_tenant = (
        await conn.execute(text("SELECT current_setting('app.tenant_id', true)"))
    ).scalar_one()
    user = (
        await conn.execute(
            text("SELECT id, username FROM users WHERE id = :uid"),
            {"uid": principal.user_id},
        )
    ).mappings().first()

    return {
        "tenant_id": str(principal.tenant_id),
        "user_id": str(principal.user_id),
        "username": principal.username,
        # The role the SERVER resolved for this request, read from the users row
        # under tenant context — not the role the token claimed. Those differ
        # after a demotion, and this is the one that gates.
        "role": principal.role,
        "db_tenant_context": db_tenant,
        "user_visible_under_tenant": user is not None,
        "db_username": user["username"] if user else None,
    }
