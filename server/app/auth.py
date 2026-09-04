"""Authentication dependency: resolve the caller's tenant, user and PERMISSIONS
from the JWT and the row.

Tenant scoping for data routes comes ONLY from the token. tenant_id is never
read from the URL or body for scoping (login is the sole exception: there the
submitted tenant_id is an identity claim, not a data filter).

Since migration 0019 the gate is a PERMISSION, not a role name (STRUCTURE.md
section 3, invariant 6): `require(Permission.X)` replaces `require_admin`, the
Principal carries the frozenset the users -> roles -> role_permissions join
returns for THIS request, and no handler compares a role name. The role CODE
still rides on the Principal for display (/whoami, the roster) and for nothing
else.
"""
from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text

from .db import tenant_connection
from .permissions import Permission
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


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    username: str
    # The CODE of the role read back from the database for THIS request (owner,
    # admin, staff, or a code the shop minted) — never the code the token
    # claimed. DISPLAY ONLY: /whoami and the roster echo it; no gate reads it
    # (invariant 6, "no handler compares a role name").
    role: str
    # The permission set the users -> roles -> role_permissions join returned
    # for THIS request. EMPTY for a user whose role is deactivated (fail closed:
    # the account still resolves, every gate refuses). The gate is `has`.
    permissions: frozenset[str]

    def has(self, permission: Permission) -> bool:
        return permission.value in self.permissions


# ONE query, the same join for get_principal and for login (main.py imports the
# fragment): the user row, the role's code and activity, and the grants as an
# array. LEFT JOIN on the grants so a role with none still resolves (to an empty
# set), and r.is_active folded into the aggregate so a DEACTIVATED role grants
# nothing while the role code is still readable for display. All three tables
# are RLS-scoped, so the join can only ever see the token's tenant.
PRINCIPAL_JOIN = (
    " FROM users u"
    " JOIN roles r ON r.id = u.role_id"
    " LEFT JOIN role_permissions rp ON rp.role_id = r.id AND r.is_active"
)
PRINCIPAL_PERMISSIONS = (
    "coalesce(array_agg(rp.permission) FILTER (WHERE rp.permission IS NOT NULL),"
    " '{}'::text[]) AS permissions"
)


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

    THE SAME WINDOW APPLIES TO A GRANT REVOKED MID-REQUEST, one field along, and
    is accepted for the same reason.
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
            # THE TOKEN'S `permissions` CLAIM IS NEVER READ HERE. It exists for
            # the phone to render with offline (advisory, exactly as `role`
            # is), and a token minted before 0019 has none -- which must not
            # be a 401, or every operator is signed out by the deploy. The set
            # below comes from the row, on every request, and from nowhere else.
            permissions=frozenset(),
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
    # honest price of not trusting a bearer token about who exists — and since
    # 0019 the same statement joins the role and its grants, so the permission
    # set costs no second read either.
    async with tenant_connection(claimed.tenant_id) as conn:
        row = (
            await conn.execute(
                text(
                    "SELECT u.is_active, u.token_version, r.code AS role,"
                    f" {PRINCIPAL_PERMISSIONS}"
                    f"{PRINCIPAL_JOIN}"
                    " WHERE u.id = :uid"
                    " GROUP BY u.is_active, u.token_version, r.code"
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

    # THE DATABASE IS THE AUTHORITY ON WHAT THE CALLER MAY DO, NOT THE CLAIM.
    #
    # The token carries a role code and a permissions list so a client can render
    # with them, but authorisation reads the row. The two differ in exactly the
    # case that matters: an admin demoted in the back office still holds a token
    # CLAIMING admin until it expires (JWT_TTL_SECONDS, an hour by default).
    # Gating on the claim would let that phone keep voiding bills for the rest of
    # the hour — the same "a valid signature is not proof" failure as above, one
    # field along.
    return replace(
        claimed, role=row["role"], permissions=frozenset(row["permissions"])
    )


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
# until a HUMAN changes their role's grants — no action by the device can clear
# it.
#
# Being mistaken for either rejection species would be actively wrong:
#   - as PERMANENT, a void request is discarded and the owner is told the bill is
#     broken, when the bill is fine and the phone simply lacks the permission;
#   - as RESOLVABLE, it is parked and retried forever against a grant that will
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
# 403 AND NOT 404, deliberately. A 404 would make "you lack the permission"
# indistinguishable from "no such endpoint" AND from "that row is not in your
# tenant" — and the last of those is a REAL 404 the master-data writes return.
# Collapsing them means a staff phone reports the server as broken and an admin
# in the wrong tenant reports a permissions bug. There is no secret being kept:
# the endpoint list is not confidential, and the caller already knows their own
# grants — they are in the token they sent.
#
# ONE CODE FOR EVERY PERMISSION REFUSAL: `permission_required`, with the
# permission named in `required_permission`. A client's wording stays a function
# of the code and the call site, exactly as it was for `admin_required`; the body
# key says WHICH rule refused, which a status alone cannot (mechanism 7 of
# lessons/a-check-that-never-went-red-was-never-observed.md). `admin_required`
# and `staff_money_hidden` are no longer answered by any route (section 12's own
# disproof), and the phone keeps them only as LEGACY keys for rows it stored
# before this deploy.
# ---------------------------------------------------------------------------


def forbidden(code: str, message: str, **context: object) -> HTTPException:
    """A refusal about WHO IS ASKING, not about the payload."""
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"kind": "forbidden", "code": code, "message": message, **context},
    )


PERMISSION_REQUIRED = "permission_required"


def permission_required(permission: Permission) -> HTTPException:
    """The one 403 every permission gate raises. The message is the same Thai
    sentence for every permission -- the client owns the wording per call site
    and keys it on `code` and `required_permission`, never on this text."""
    return forbidden(
        PERMISSION_REQUIRED,
        "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้",
        required_permission=permission.value,
    )


def require(
    permission: Permission,
) -> Callable[..., Awaitable[Principal]]:
    """Gate an endpoint on ONE permission. `Depends(require(Permission.X))` is a
    drop-in for `Depends(get_principal)` that also refuses.

    A dependency FACTORY: the permission is a member of the closed enumeration,
    so a gate naming a permission that does not exist is a type error at the
    call site rather than a string nothing checks (section 3.4). FastAPI caches
    get_principal within a request, so depending on this does NOT buy a second
    user lookup — the same resolved Principal comes back, and the check is one
    set membership.
    """

    async def _gate(principal: Principal = Depends(get_principal)) -> Principal:
        if not principal.has(permission):
            raise permission_required(permission)
        return principal

    _gate.__name__ = f"require_{permission.name.lower()}"
    return _gate
