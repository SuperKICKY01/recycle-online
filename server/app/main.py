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

from . import clock_guard, login_guard, permissions, version_gate
from .auth import PRINCIPAL_JOIN, PRINCIPAL_PERMISSIONS, Principal, get_principal
from .bills import router as bills_router
from .db import directory_engine, engine, tenant_connection
from .directory import router as directory_router
from .master import router as master_router
from .payments import router as payments_router
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
    # THE SERVER'S OWN IDENTIFIER FOR THE USER WHO JUST SIGNED IN.
    #
    # Added for P1.7: the client has to stamp an owner on every local row, and
    # until now a successful login handed it nothing that named the user. What
    # it had was the username it typed — which is unique only WITHIN a shop
    # (migration 0001, uq_users_tenant_username) and can be changed, so a row
    # storing one would come to point at nobody.
    #
    # IT IS RETURNED HERE RATHER THAN READ OUT OF THE TOKEN, and that is the
    # whole reason this field exists. A client cannot verify the token's
    # signature — it holds no secret, by design — so a client that parsed its
    # own claims would be trusting a document it cannot check, on a field whose
    # wrongness is invisible: a bill attributed to the wrong person looks
    # exactly like one attributed to the right person.
    #
    # It is the SAME value that goes into the token below, from the same row
    # read in the same statement, so the two cannot drift.
    user_id: uuid.UUID


@asynccontextmanager
async def lifespan(_: FastAPI):
    # THE PERMISSION CATALOGUE MUST EQUAL THE CODE, OR THIS PROCESS DOES NOT
    # SERVE (migration 0019, STRUCTURE.md invariant 6). Checked FIRST, before the
    # clock: a RuntimeError here fails uvicorn's startup, the operator reads both
    # sets in the traceback, and /health never answers -- never a 500 on the
    # first gated request. app/permissions.py says why this fails closed.
    await permissions.assert_catalogue()
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


@app.middleware("http")
async def _refuse_outdated_client(request, call_next):
    """Refuse a client too old to speak this API version — except /health.

    THE CONTRACT IN ONE PLACE. Enforced as middleware, not as a per-route
    dependency, so no route can forget it — including routes that do not exist
    yet. The judgement itself lives in `version_gate`; this is only the seam that
    reads the request and returns the refusal. See that module for what a version
    means, why the floor fails OPEN, and why the floor is a file read per request.

    WHY 426, AND DISTINGUISHABLE FROM EVERYTHING ELSE. A too-old client is
    answered 426 (Upgrade Required), which this API emits nowhere else and which a
    client branches on WITHOUT parsing the body — the same status-not-prose
    discipline auth.py (295-326) states for 401/403 and bills.py for 424. It must
    not be mistaken for a 401 (the login screen renders on that and a version
    refusal would send the operator to sign in forever) nor for a 5xx (an old
    client retries those forever behind the poison alarm). It is a fifth axis:
    about the client's BUILD, cleared only by an update.

    /health IS THE ONE EXEMPT PATH, and the exemption is by exact equality, like
    the clock guard above it. A too-old client — and any monitor — can still
    confirm the server is up; it learns it is too old from the 426 every OTHER
    route returns, so no separate "version endpoint" is owed. Nothing else is
    exempt: a too-old client hitting /auth/shop-code or /auth/login is refused
    426, which is correct — it must not proceed to sign in against a server whose
    contract it can no longer read.

    THIS RUNS OUTERMOST, BEFORE THE CLOCK GUARD. Registered after the clock
    middleware, and Starlette wraps `reversed(user_middleware)` over an
    insert(0) list, so the later registration is the outer wrapper and runs
    first. The consequence, chosen deliberately: a too-old client is told to
    UPDATE even while the clock guard is tripped — because updating is its one way
    forward in every server state, whereas a 503 would read as "retry later" for a
    client that retrying can never fix.
    """
    if request.url.path != "/health":
        client_version = version_gate.client_version_from(
            request.headers.get(version_gate.CLIENT_API_VERSION_HEADER)
        )
        floor = version_gate.current_floor()
        if version_gate.too_old(client_version, floor):
            return JSONResponse(
                status_code=status.HTTP_426_UPGRADE_REQUIRED,
                content=version_gate.refusal_payload(client_version, floor),
            )
    return await call_next(request)


app.include_router(bills_router)
app.include_router(directory_router)
app.include_router(master_router)
app.include_router(payments_router)
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
    # no cross-tenant login path. The lockout count reads the SAME tenant in the
    # SAME snapshot, so a guesser can only ever move the counter for the
    # (tenant_id, username) it is actually attacking (login_guard, migration 0016).
    async with tenant_connection(body.tenant_id) as conn:
        locked = await login_guard.is_locked_out(conn, body.username)
        # THE SAME JOIN get_principal runs (auth.PRINCIPAL_JOIN), so the role
        # code and the grant list minted into the token below are what the
        # first authenticated request would resolve -- one statement, one
        # snapshot, and the token's advisory claims cannot say more than the row.
        row = (
            await conn.execute(
                text(
                    "SELECT u.id, u.tenant_id, u.username, r.code AS role,"
                    " u.token_version, u.is_active, u.password_hash,"
                    f" {PRINCIPAL_PERMISSIONS}"
                    f"{PRINCIPAL_JOIN}"
                    " WHERE u.username = :u"
                    " GROUP BY u.id, u.tenant_id, u.username, r.code,"
                    " u.token_version, u.is_active, u.password_hash"
                ),
                {"u": body.username},
            )
        ).mappings().first()

    # THE LOCKOUT, CHECKED FIRST AND BYTE-IDENTICAL TO THE OTHER REFUSALS.
    #
    # A locked account is refused with the SAME _INVALID_LOGIN a wrong password
    # gets, deliberately: disclosing "locked" here would tell a guesser that a
    # given (tenant, username) has recently seen real failed traffic, and re-open
    # the username-oracle question OPEN_ITEMS.md records as the owner's decision,
    # not a fix. The operator is told instead through the AUTHENTICATED admin
    # unlock route, the same channel-not-the-refused-caller shape the is_active
    # note below uses.
    #
    # A DUMMY_HASH verify is paid so a locked refusal costs the same one argon2 as
    # every other refusal — the anti-timing-oracle discipline the DUMMY_HASH
    # verify below already applies, extended to this third refusal.
    #
    # NOTHING IS RECORDED on this path. An attempt against an already-locked
    # account writes no row: recording it as `failed` would let a guesser hold the
    # lockout open past its window, and any recording would let them grow the table
    # one row per request without bound. So the lockout bounds the table's own
    # growth (login_guard / migration 0016).
    if locked:
        await verify_password(DUMMY_HASH, body.password)
        raise _INVALID_LOGIN

    if row is None:
        # Equalise timing with the found-user path; never reveal user existence.
        await verify_password(DUMMY_HASH, body.password)
        # Record the refused attempt so it counts toward the lockout. This is a
        # SEPARATE committed transaction inside login_guard (the login's own read
        # transaction is already closed above), so the row survives the raise
        # below — a record inside a rolling-back block would never move the
        # counter, which is exactly one disproof prove_login_guard.py performs.
        await login_guard.record_failed_attempt(body.tenant_id, body.username)
        raise _INVALID_LOGIN
    if not await verify_password(row["password_hash"], body.password):
        await login_guard.record_failed_attempt(body.tenant_id, body.username)
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
        # A deactivated account is a refused credential too, so it counts toward
        # the lockout like the two above. Harmless overlap: the account is already
        # refused by is_active, and the counter simply also fills.
        await login_guard.record_failed_attempt(body.tenant_id, body.username)
        raise _INVALID_LOGIN

    token = create_access_token(
        user_id=row["id"],
        tenant_id=row["tenant_id"],
        username=row["username"],
        role=row["role"],
        # ADVISORY, like `role`: the phone gates its controls on it offline. The
        # server never reads it back (auth.get_principal).
        permissions=list(row["permissions"]),
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
    # `row["id"]` and nothing else: the SAME value handed to create_access_token
    # above, out of the same `row` read in the same statement at :210-218. There
    # is no second lookup here for the two to drift between.
    return LoginResponse(access_token=token, user_id=row["id"])


async def get_authed_conn(principal: Principal = Depends(get_principal)):
    """A DB connection whose transaction is scoped to the TOKEN's tenant.

    It also carries the actor (app.actor_id / app.actor_username), so a route that
    reaches an audited master-data table through this shared dependency records who
    did the write (migration 0017); a read simply leaves the GUCs unread.
    """
    async with tenant_connection(
        principal.tenant_id,
        actor_id=principal.user_id,
        actor_username=principal.username,
    ) as conn:
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
        # The role CODE and the PERMISSIONS the SERVER resolved for this request,
        # read from the users -> roles -> role_permissions join under tenant
        # context — not what the token claimed. Those differ after a demotion or
        # a revoked grant, and the permission set is the one that gates. The
        # phone rewrites its cached_permissions from this answer (0019).
        "role": principal.role,
        "permissions": sorted(principal.permissions),
        "db_tenant_context": db_tenant,
        "user_visible_under_tenant": user is not None,
        "db_username": user["username"] if user else None,
    }
