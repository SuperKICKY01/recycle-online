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


def unauthenticated(code: str, message: str) -> HTTPException:
    """A refusal about WHO IS ASKING — and the answer is "nobody".

    Same kind/code envelope as forbidden() below, master._not_found/_invalid and
    bills._master_data_missing: ONE refusal vocabulary across the API.

    THE MESSAGE IS ENGLISH AND IS FOR LOGS AND DIAGNOSIS ONLY. It is not UI
    text and no client may print it. A1 settled this for the daily report and it
    holds here: the client owns the sentences, the server owns the facts. A
    client that echoes a server's prose states something it cannot verify, and
    the yard-facing Thai wording for an ended session is R1b's decision, made on
    the client where the screen is.

    A CLIENT MUST BRANCH ON THE STATUS, NEVER ON THIS BODY. 401 is not 403, not
    422, not 424, not 5xx, and that axis survives a body that fails to parse at
    all — the same argument the 403 note below makes. All three codes here mean
    exactly one thing to a device: you are nobody, the queued bills are fine,
    sign in again. The codes exist so a human reading a log can tell a token
    that ran out from one that was deliberately ended, and so R1b can differ in
    WORDING if it chooses. Nothing may string-match the message.
    """
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"kind": "unauthenticated", "code": code, "message": message},
        headers={"WWW-Authenticate": "Bearer"},
    )


# Bad signature, expired, malformed, a missing claim, or a `sub` naming no user.
# Deliberately one code for all of them: which one it was is not the caller's
# business and the reaction is identical.
_UNAUTHENTICATED = unauthenticated(
    "token_invalid", "token missing, malformed, expired, or naming no user"
)

# The token carries NO token_version claim at all: every token minted before
# migration 0005. REFUSED — never read as 0, never waved through. See the note
# in get_principal.
_UNVERSIONED = unauthenticated(
    "token_unversioned", "token predates session revocation and cannot be checked"
)

# The claim is present and STALE: this session was ended deliberately, by a
# revoke-sessions call on that user. The user is not locked out — signing in
# again mints a token carrying the current version.
_REVOKED = unauthenticated(
    "token_revoked", "session was revoked; sign in again for a current token"
)

# The ACCOUNT is locked: an admin deactivated it (migration 0007). Unlike
# _REVOKED, signing in again does not help — /auth/login refuses this user too,
# and refuses them with the same body a wrong password gets, so the code exists
# for the log and for nothing else. A device still reacts to all four of these
# identically; see the note on unauthenticated() above.
_INACTIVE = unauthenticated(
    "account_inactive", "account is deactivated and may not be used"
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
    """Resolve the caller, and refuse a token the database no longer honours.

    THE ONE-REQUEST WINDOW, STATED RATHER THAN CLOSED
    -------------------------------------------------
    This function opens its own short read transaction, and the handler opens a
    SECOND one afterwards (main.get_authed_conn). A revocation that commits
    between the two is not seen by this request: the version check has already
    passed, and the handler proceeds. So a bump can let exactly ONE in-flight
    request through, and if that request is POST /bills it writes a bill.

    How wide: the gap between this transaction committing and the handler's
    transaction starting — sub-millisecond on this stack, and it can only be
    entered by a request that was already in flight when the bump landed. It
    cannot be entered by a request that starts afterwards.

    It FAILS CLOSED ON THE NEXT REQUEST. The window admits one request, never a
    session: the token is dead from the following call onwards, with no
    dependence on the clock, on the client noticing, or on anything retrying.

    NOT FIXED, deliberately. Closing it means resolving the principal inside the
    handler's own transaction, which restructures every route's dependency
    graph to buy a sub-millisecond boundary on an operation (revoking a session)
    that is not racing anything — nobody bumps a version at the same instant as
    the very request they are trying to stop. Any issue-then-check scheme has
    this window somewhere; moving it is not removing it. Recorded here so the
    next reader knows it was measured and accepted rather than missed.
    """
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

    # FAIL CLOSED ON A TOKEN WITH NO VERSION AT ALL.
    #
    # Every token minted before migration 0005 carries no token_version claim.
    # Such a token is REFUSED — not read as version 0, not read as valid, not
    # given the benefit of any doubt. `claims["token_version"]` (never .get with
    # a default) is what makes that structural rather than remembered: an absent
    # claim RAISES instead of resolving to a confident answer, which is
    # lessons/a-defaulted-getattr-is-a-silent-dead-branch.md, and a default
    # version would be a default IDENTITY, which is
    # lessons/config-defaults-must-fail-closed.md.
    #
    # A claim that is present but unusable (null, a string, a float) lands here
    # too, and is refused with the same code. It is not literally "unversioned",
    # but nothing legitimate produces it — only a correctly-SIGNED forgery
    # could, at which point the secret has leaked and this is not the problem —
    # the reaction is identical, and refusing is the only safe answer either way.
    try:
        token_version = int(claims["token_version"])
    except (KeyError, TypeError, ValueError):
        raise _UNVERSIONED

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
                # token_version and is_active ride along on the query that was
                # ALREADY here. No second read per request: that is a design
                # constraint of this work, not an optimisation. The lookup that
                # proves the user exists is on this path regardless, and it now
                # returns three columns instead of one.
                text(
                    "SELECT role, is_active, token_version"
                    " FROM users WHERE id = :uid"
                ),
                {"uid": claimed.user_id},
            )
        ).mappings().first()
    if row is None:
        raise _UNAUTHENTICATED

    # THE LOCK CHECK. Its own deletable line, and it runs BEFORE the revocation
    # check — the ordering is load-bearing and the helper's docstring says why.
    _require_active_account(row["is_active"])

    # THE REVOCATION CHECK. Deleting this ONE line leaves valid, running code in
    # which a revoked token is accepted until it expires — which is exactly the
    # disproof scripts/prove_revocation.py performs (CASE 7).
    _require_live_session(token_version, row["token_version"])

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


def _require_active_account(is_active: bool) -> None:
    """Refuse a token belonging to an account an admin has deactivated.

    A helper rather than an inline `if`, for the reason _require_live_session
    gives below and by the same argument: it leaves the disproof ONE deletable
    line that keeps the module parsable and the server bootable, so "the check is
    gone" and "nobody could run the check" cannot share an outcome.

    WHAT DELETING IT ACTUALLY CHANGES — LESS THAN IT LOOKS, and a proof written
    on the assumption that it is more would be measuring nothing. Deactivation
    bumps token_version in the SAME statement, so every token in existence when
    the lock lands is also stale, and _require_live_session below would refuse it
    anyway. Delete this line and such a request is still 401. What changes is the
    CODE — account_inactive becomes token_revoked — which is what an assertion
    can see and what an operator reading a log would notice.

    THAT IS WHY IT RUNS FIRST. Ordered after the version check it would be
    unreachable through every path this product has, and a guard no input can
    reach is a guard whose green carries no information — the second mechanism in
    lessons/a-check-that-never-went-red-was-never-observed.md, "the failing state
    is unreachable from the inputs supplied". Ordered here it names the durable
    fact, that the ACCOUNT is locked, rather than the incidental one, that this
    particular token is old.

    IT IS STILL NOT REDUNDANT. It is what refuses if any future path mints a
    token for a locked account: a bump made conditional, a password reset, an
    onboarding tool, a change to what /auth/login checks. The version check
    answers "is this token current"; only this one answers "may this account be
    used at all", and those stop being the same question the moment anything else
    can issue a token.
    """
    if not is_active:
        raise _INACTIVE


def _require_live_session(claimed_version: int, current_version: int) -> None:
    """Refuse a token minted before this user's sessions were last revoked.

    A helper rather than two inline lines ON PURPOSE. It gives the disproof a
    single deletable line: remove the call in get_principal and the code still
    parses, the server still starts, and exactly one behaviour changes. Deleting
    `raise _REVOKED` out of an inline `if` would instead leave an empty block,
    the server would refuse to start, and prove_revocation would go red for the
    wrong reason — "the check is gone" and "nobody could run the check" must
    never share an outcome, which is the same distinction reconcile.py draws
    between exit 1 and exit 2.

    Equality, not `<`. A version that is somehow AHEAD of the row is not a
    fresher session, it is a token this server did not mint from this row, and
    treating it as acceptable would make the ordering the security property.
    """
    if claimed_version != current_version:
        raise _REVOKED


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
