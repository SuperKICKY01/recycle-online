"""FastAPI app for Phase 1b: login, whoami probe, health.

No bill or master-data endpoints yet — this phase exists only to prove the
per-request tenant-context layer over real HTTP.
"""
from __future__ import annotations

import asyncio
import contextlib
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from . import clock_guard
from .auth import Principal, get_principal
from .bills import router as bills_router
from .db import directory_engine, engine, tenant_connection
from .directory import router as directory_router
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
    # EVALUATED BEFORE THE FIRST REQUEST IS SERVED, not on the first request.
    # A clock that is wrong is wrong for bill number one, and there is no
    # "first request" on a shop's server that is safe to get wrong.
    await clock_guard.evaluate()
    tick = asyncio.create_task(clock_guard.tick_forever())
    try:
        yield
    finally:
        tick.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await tick
        await engine.dispose()
        # BOTH engines, and this one was owed. f84b54d added directory_engine
        # and named its absence here as a debt for "the first commit that opens
        # a connection from the application" -- this is that commit. It was
        # harmless while nothing connected on it (dispose on an engine with an
        # empty pool is a no-op); it stops being harmless the moment a request
        # checks a connection out.
        await directory_engine.dispose()


app = FastAPI(title="Recycle Online API (Phase 2c-2)", lifespan=lifespan)


# The key pydantic puts the REJECTED VALUE in. Removed from every validation
# error this API emits; see the handler below for why it is one key and not a
# list of field names.
_REJECTED_VALUE_KEY = "input"


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    """A 422 that says WHICH field and WHY, and never hands the value back.

    THE DEFECT THIS EXISTS TO CLOSE. FastAPI's default handler is
    `JSONResponse(status_code=422, content={"detail": jsonable_encoder(
    exc.errors())})`, and pydantic's error objects carry an `input` key holding
    the value that failed. So the refusal of a too-short password RETURNED THAT
    PASSWORD: `{"type":"string_too_short","loc":["body","password"],"input":
    "abc1234",...}`. Measured on POST /users, 2026-08-10
    (lessons/a-refusal-hands-back-what-it-refused.md).

    IT IS FIXED HERE, BEFORE THE TWO PASSWORD ROUTES, AND THAT ORDER IS THE
    POINT. Those routes carry two secrets in one request — the password in use
    and its replacement — and fixing it at them would leave an API that is safe
    where somebody remembered and leaks where nobody did.

    ONE KEY, REMOVED UNCONDITIONALLY, NEVER A LIST OF FIELD NAMES. A list of
    secret-ish names — password, new_password, pin, secret, token — is the
    author guessing at what a thing may be CALLED, which is exactly
    lessons/a-gate-that-matches-a-keyword-misses-its-aliases.md, and it fails in
    the PERMISSIVE direction: a field nobody thought to add is a field that
    leaks. There is nothing here to classify and nothing to maintain, so a route
    written next year is covered by a decision taken today.

    API-WIDE BY CONSTRUCTION, not by anybody remembering. It is registered
    against the EXCEPTION CLASS on the app, and every request-validation failure
    on every route raises that class — including routes that do not exist yet.
    FastAPI installs its own with `setdefault`, so registering here replaces it
    rather than racing it.

    WHAT IS DELIBERATELY UNCHANGED. `detail` stays a LIST of error objects, and
    each object keeps `type`, `loc`, `msg` and `ctx`: WHICH field failed, in what
    way, and against what bound. A handler that made every validation error
    uninformative would have traded one defect for a worse one — and the shape
    is load-bearing elsewhere, because prove_master_write.py distinguishes this
    422 from the API's kind/code refusals by the fact that it carries a list and
    no `kind`.

    NOT THIS HANDLER'S PATH: HTTPException-based 422s (master._invalid) are
    raised, not validated, so they go through http_exception_handler and keep
    their kind/code envelope untouched.

    THE ONE THING IT CANNOT REACH, stated rather than discovered later: a CUSTOM
    validator that interpolates the rejected value into its own message would
    still echo it through `msg`, because that text is the author's and no handler
    can tell it from a legitimate sentence. Every constraint in this API today is
    declarative, so there is no such message; if one is ever written, the rule is
    at the validator, not here.

    NOTHING IS LOGGED. Redacting a value from the response and then writing it to
    the server's log would move the disclosure rather than close it.
    """
    scrubbed = [
        {k: v for k, v in error.items() if k != _REJECTED_VALUE_KEY}
        for error in exc.errors()
    ]
    # jsonable_encoder for the same reason the default handler uses it: `ctx` can
    # hold objects that are not JSON-serialisable, and a handler that raised
    # while reporting a 422 would turn a client's terminal rejection into a 500,
    # which the mobile engine reads as `unavailable` and retries forever
    # (lessons/unavailable-is-not-rejected.md).
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(scrubbed)})


@app.middleware("http")
async def _refuse_while_clock_is_wrong(request, call_next):
    """Refuse to serve while the clock guard is tripped — except /health.

    WHAT THIS COVERS: everything except the exact path /health. That includes
    POST /auth/login, so a tripped clock means NOBODY CAN SIGN IN — including
    whoever has to diagnose it. That is deliberate: with a wrong clock every
    write would be refused anyway and every report would carry a wrong day, so a
    session buys nothing. It is still the consequence most likely to surprise
    someone at 06:00, so it is written here rather than left to be discovered.

    THE WAY BACK IN, in order:
      1. /health needs no auth and stays up. It returns the machine-readable
         reason, the watermark, the observed instant and how far behind it is.
         This is why the guard does not exit the process.
      2. The tick clears it UNATTENDED if the clock corrects itself — the
         container-that-started-before-NTP case, which is the likeliest trigger.
         No human action at all.
      3. Otherwise scripts/reset_clock_watermark.py, run as the OWNER role
         DIRECTLY AGAINST THE DATABASE. It does not go through this API and
         needs no login.

    THE CONSEQUENCE THAT MATTERS TO WHOEVER HITS THIS: recovery by path 3 needs
    DATABASE CREDENTIALS AND SHELL ACCESS ON THE HOST, not an admin account in
    the product. A support path that only speaks HTTP cannot clear this guard.
    """
    if clock_guard.STATE.should_refuse() and request.url.path != "/health":
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": clock_guard.TRIPPED_DETAIL,
                     "status": clock_guard.STATE.refusal_status(),
                     "clock": clock_guard.STATE.as_dict()},
        )
    return await call_next(request)


app.include_router(bills_router)
app.include_router(directory_router)
app.include_router(master_router)
app.include_router(reports_router)
app.include_router(users_router)

_INVALID_LOGIN = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials"
)


@app.get("/health")
async def health() -> JSONResponse:
    # A green /health under a wrong clock would be the most expensive lie this
    # service could tell: it is the one thing an operator checks first.
    clock = clock_guard.STATE.as_dict()
    if clock_guard.STATE.should_refuse():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": clock_guard.STATE.refusal_status(),
                     "detail": clock_guard.TRIPPED_DETAIL, "clock": clock},
        )
    return JSONResponse(content={"status": "ok", "clock": clock})


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
                    " is_active, password_hash FROM users WHERE username = :u"
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

    # THE LOCK, AND IT IS CHECKED AFTER THE PASSWORD ON PURPOSE.
    #
    # Ordering first, because getting it wrong fails silently. Short-circuiting
    # on is_active BEFORE verify_password would let a locked account answer
    # without paying for an argon2 verify, so it would come back measurably
    # faster than a live account with a bad password. That is a timing oracle for
    # "this username exists and is locked" — precisely what the DUMMY_HASH verify
    # four lines above exists to close, reintroduced one branch further down.
    # Checked here, all three refusals cost exactly one verify: unknown user
    # (dummy), wrong password (real), locked (real).
    #
    # THE REFUSAL IS BYTE-IDENTICAL TO THE OTHER TWO, deliberately. A distinct
    # code would tell anyone who can reach this endpoint that a given
    # (tenant_id, username) is a real account. The caller must already hold the
    # shop's uuid today, which narrows that a long way; the step that replaces
    # the uuid with something a human can type removes the narrowing, and a
    # refusal shape written now would outlive it.
    # lessons/login-resolves-under-tenant.md is the standing rule — ONE generic
    # error for both unknown-user and wrong-password — and this is a third arm of
    # the same refusal rather than an exception to it.
    #
    # THE COST, STATED RATHER THAN HIDDEN: a locked person and a person who
    # mistyped their password get the same sentence, so nothing they can see
    # tells the two apart and a call to the shop is the only way to find out.
    # The ADMIN is told instead, through a channel the refused caller is not on —
    # POST /users/{id}/deactivate returns is_active and the new token_version in
    # its own 200.
    if not row["is_active"]:
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
