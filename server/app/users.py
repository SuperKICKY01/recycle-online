"""The shop's people: the roster, the sessions they hold, and the account state.

GET /users is what makes the three routes below reachable. Each of them takes a
user_id in the path, and until this endpoint existed NO response anywhere in
this API produced another user's uuid except as a bare id on a bill header
(purchase_bills.created_by / voided_by, and only for bills that have one). So
every capability in this module was built, proven, and invokable only by someone
holding a database connection. A shop owner dismissing an employee had no way to
name them.

TWO KINDS OF THING, AND THEY MUST NOT BE READ AS ONE
-----------------------------------------------------
POST /users/{id}/revoke-sessions ends the sessions a person holds right now. It
is an EVENT — "end what exists at this moment".

POST /users/{id}/deactivate and /activate set whether the account may be used at
all. That is a STATE. Deactivating also performs the event above, in the same
UPDATE statement, because a lock that left already-issued tokens working would
be a lock in name only: JWT_TTL_SECONDS is 3600 and there is no refresh token,
so it would take up to an hour to mean anything.

NOTHING HERE DELETES ANYTHING. There is no delete path for a user in this
system and this module adds none.

WHAT IS STILL A STOPGAP, AND WHAT NO LONGER IS
-----------------------------------------------
The design calls for `users.token_version` to be bumped on TWO events: a
password change and a user deactivation. DEACTIVATION NOW EXISTS and bumps it
here, as prescribed. A password endpoint still does not exist anywhere in this
system, so revoke-sessions keeps its original job for that half.

It is not redundant even once a password endpoint arrives, and the reason is the
job deactivation cannot do: ending a session on a HANDOVER, where the account
must go on working afterwards. When a password-change endpoint is built, IT
should bump the version as part of its own work, exactly as deactivate does.

WHAT A DEACTIVATION DOES NOT DO, STATED PLAINLY
------------------------------------------------
It does not reach a bill that has already been written. The money, the doc_no
and the author (`purchase_bills.created_by`, migration 0006) are untouched, and
a locked user goes on resolving as the author of every bill they wrote. That is
what an audit column is for and locking an account may not disturb it — the
`COMMENT ON COLUMN` in migration 0007 says the same thing to whoever writes the
first query against this table.

Nor does it lock a PERSON. It locks an account; nothing in this system knows
that two accounts are the same human being.

SELF-REVOCATION IS ALLOWED; SELF-DEACTIVATION IS REFUSED, AND THE ASYMMETRY IS
THE POINT
------------------------------------------------------------------------------
An admin may end their own sessions, and their very next request 401s. That is
the honest meaning of "end this user's sessions", and refusing it would be an
invented rule — "sign out everywhere" is a legitimate thing for an owner to
want, and the cost of being wrong is one login.

Locking your own account is a different thing: /activate is admin-only, so an
admin who locks itself cannot unlock itself, and a shop whose ONLY admin does it
has nobody left who can. Refused at the call site, with the reason.

A LARGER VERSION OF THAT HAZARD IS DELIBERATELY NOT GUARDED — locking the last
remaining active admin by any route. The guard needs a count of active admins,
and a count wrong in the refusing direction locks a shop out of its own user
management for a reason nobody on the shop floor can see. Recorded in
OPEN_ITEMS.md as the owner's decision, with that cost stated.
"""
from __future__ import annotations

import uuid
from collections.abc import Mapping
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from .auth import Principal, forbidden, require_admin
from .db import tenant_connection

# The refusal vocabulary is master.py's and is IMPORTED rather than restated.
# An error shape is a CONVENTION, and a second copy of a convention drifts at
# the boundary neither author tested — lessons/a-checker-must-not-share-the-code
# -it-checks.md draws exactly this line (duplicate arithmetic, never duplicate a
# convention). It wants its own module eventually; that refactor is recorded in
# OPEN_ITEMS.md and is deliberately not done here.
#
# _active_filter arrives on the same argument and for the same reason. What it
# carries is not the two-line string it builds — a second author would write
# `WHERE is_active` unprompted — but the BOUND stated in its own docstring: it
# is for LIST endpoints, and row-level reads never use it. That bound is the
# whole of what migration 0007's COMMENT ON COLUMN asks of this file, so it
# should arrive with the code rather than be remembered beside it.
from .master import _active_filter, _not_found

router = APIRouter()


# ---------------------------------------------------------------------------
# The roster
# ---------------------------------------------------------------------------
# A SEPARATE annotated type, NOT master.IncludeInactive, and the difference is
# one sentence of prose that would otherwise be wrong on this route. That one
# reads "the yard app must never be offered a retired product" — true of a
# picker, false here, and it is published in the OpenAPI schema where it is the
# only description a caller ever sees.
IncludeInactiveUsers = Annotated[
    bool,
    Query(
        description=(
            "Include locked accounts. Default false FOR CONSISTENCY with the"
            " four master-data lists, which is the whole of the reason: those"
            " default false to keep a retired row out of a picker, and NOTHING"
            " here picks a user to write a row, so that justification does not"
            " transfer and must not be assumed. Pass true to find an account"
            " that was locked by mistake — a row that cannot be listed cannot"
            " be reactivated either."
        )
    ),
]


def _user_payload(r: Mapping[str, Any]) -> dict:
    """FIVE KEYS, and the two that are missing are the decisions.

    `user_id` rather than `id`, matching _user_or_404 below so the key a caller
    reads a user out of is one string across this whole module. master.py says
    `id`; its routes are not the ones this list feeds.

    NO password_hash, for no reason worth writing down.

    NO token_version, and this is the one that needed an argument. It is not a
    secret — a caller's own version already sits in the token in their pocket —
    so withholding it is not confidentiality, it is declining to publish a field
    with no reader and one bad use. The bad use: auth.get_principal decides a
    session on `claimed_version != current_version`, EQUALITY and never
    ordering, for the reason _require_live_session states. Publish the current
    value in a list and a client can re-derive that check without asking, and it
    will re-derive it wrong — stale by the time it acts, and as an ordering
    comparison, which is the shape that was deliberately refused. A second
    implementation of a security predicate is exactly what
    lessons/a-checker-must-not-share-the-code-it-checks.md forbids.
    The three write routes DO return it, and that is not an inconsistency: there
    a caller is reading the effect of their own action on one named row, which
    _user_or_404 argues for itself.

    NO created_at. It reveals nothing and would be genuinely useful for telling
    two accounts apart — but it is a timestamp a human reads, and every one of
    those must render through the one shop-time formatter
    (lessons/render-in-shop-time-not-device-time.md). There is no screen yet to
    render it; shipping the field ahead of the formatter is how a client ends up
    slicing the ISO string. Adding a key later breaks nothing.
    """
    return {
        "user_id": str(r["id"]),
        "username": r["username"],
        "full_name": r["full_name"],
        "role": r["role"],
        "is_active": r["is_active"],
    }


_USER_SELECT = "SELECT id, username, full_name, role, is_active FROM users"


@router.get("/users")
async def list_users(
    include_inactive: IncludeInactiveUsers = False,
    principal: Principal = Depends(require_admin),
) -> dict:
    """The shop's people. ADMIN ONLY — and that BREAKS the convention on purpose.

    Every other list route in this API is Depends(get_principal): uoms,
    product-categories, products, sellers, bills. This one is not, and the
    reason is an asymmetry rather than a preference.

    Whether GET /bills should be shop-wide for staff is an open question in
    OPEN_ITEMS.md, but it is a DIFFERENT question: a staff token can already
    read every bill in its shop, both prices included, so the day's numbers are
    derivable by a phone today and the decision there is whether to close a door
    already standing open. Nothing in this API yields a colleague's NAME. So
    applying the convention here would not be following a precedent, it would be
    making a new disclosure — the shop's whole staff list, with roles, to every
    handset at the weighbridge — by inertia rather than by decision.

    And the two directions do not cost the same. Opening this later is one
    dependency changed; closing it after every phone has held the roster is not.
    Same asymmetry the daily report was settled on.

    A LIST IS NOT A ROW-LEVEL READ, which is what makes the is_active filter
    legitimate here. Migration 0007's COMMENT ON COLUMN says "no row-level read
    of this table may filter on this column", and the harm it names is specific:
    a filtered row-level read would blank the author of every bill a departed
    employee ever wrote, because purchase_bills.created_by and .voided_by are
    composite FKs into this table. A list endpoint cannot blank a bill's author.
    Nothing in this module reads a user row for a bill, and if anything ever
    does, it must not call _active_filter.

    ORDER BY username is a TOTAL order, not merely a stable one:
    uq_users_tenant_username (migration 0001) makes it unique per tenant, so
    unlike master.py's ORDER BY code it can never tie and never needs a
    tiebreak.

    NO hand-written `WHERE tenant_id`, for the reason revoke_sessions gives
    below (hard rule 2): tenant_connection issues SET LOCAL from the TOKEN's
    tenant and the RLS policy's USING clause does the scoping, so an admin of
    tenant A sees tenant A's users and there is no predicate here to get wrong.
    """
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(
                    f"{_USER_SELECT}{_active_filter(include_inactive)}"
                    f" ORDER BY username"
                )
            )
        ).mappings().all()
    return {"users": [_user_payload(r) for r in rows]}


@router.post("/users/{user_id}/revoke-sessions")
async def revoke_sessions(
    user_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    """Bump this user's token_version: every token issued to them stops working.

    ADMIN ONLY. Ending another person's session is an act of authority over an
    account, which is the same class of thing as voiding a bill — not something
    every phone on the yard floor may do to any user.

    Returns the NEW version so a caller can see the bump landed. Callers must
    not treat that number as meaningful in itself: it is a counter, not a count
    of anything, and its only contract is that it changed.

    NOT idempotent, and that is right. Two calls bump twice. `_set_active` in
    master.py is deliberately idempotent because the caller asks for a STATE;
    here the caller asks for an EVENT ("end the sessions that exist now"), and
    the second call ends any session created since the first.
    """
    async with tenant_connection(principal.tenant_id) as conn:
        # NO hand-written `WHERE tenant_id`, deliberately (hard rule 2). The RLS
        # policy's USING clause already restricts the visible rows to the
        # context tenant, so an admin of tenant A naming a user id in tenant B
        # matches NOTHING and this returns None -> 404. The tenant predicate is
        # a property of the table that no handler can forget; a hand-written one
        # is the version that can be wrong. Same doctrine as master._update_row.
        row = (
            await conn.execute(
                text(
                    "UPDATE users SET token_version = token_version + 1"
                    " WHERE id = :id"
                    " RETURNING id, username, token_version"
                ),
                {"id": user_id},
            )
        ).mappings().first()

    if row is None:
        # 404, not 403: from inside this tenant the row does not exist. Saying
        # "forbidden" would confirm that some other shop has a user with that
        # id, which is precisely what tenant isolation exists to prevent.
        raise _not_found("user")

    return {
        "user_id": str(row["id"]),
        "username": row["username"],
        "token_version": row["token_version"],
    }


def _user_or_404(row: Mapping[str, Any] | None) -> dict:
    """The 404 and the response body for the two account-state routes below.

    404, NOT 403, for the reason revoke_sessions gives above: from inside this
    tenant the row does not exist, and answering "forbidden" would confirm that
    some other shop has a user with that id.

    `is_active` rides in the body so THE ADMIN'S OWN 200 IS THE OBSERVATION that
    the lock landed. That matters more than it looks: the locked person's screen
    cannot be that observation, because POST /auth/login answers a locked account
    with the same refusal it gives a mistyped password, deliberately, so nothing
    the refused caller sees distinguishes the two. `token_version` rides along
    for the same reason — it is how a caller sees that the sessions went too.

    revoke_sessions is deliberately NOT switched to this helper. Its response
    shape is already proven by scripts/prove_revocation.py, and adding a key to a
    proven endpoint in passing, for tidiness, is not a change this work needs.
    """
    if row is None:
        raise _not_found("user")
    return {
        "user_id": str(row["id"]),
        "username": row["username"],
        "is_active": row["is_active"],
        "token_version": row["token_version"],
    }


@router.post("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    """Lock an account: it can no longer sign in, and its live sessions end now.

    ADMIN ONLY — the same class of authority as revoking a session or voiding a
    bill, and not something a yard phone may do to any user.

    ONE UPDATE, NOT TWO. `is_active` and `token_version` move in the same
    statement, so there is no window — not even a transactional one a reader has
    to reason about — in which the account is locked and the sessions it holds
    are not. The bump is what makes the lock immediate; without it the person
    keeps working until their token expires, up to JWT_TTL_SECONDS later.

    THE BUMP IS UNCONDITIONAL, including on an account that is already locked. A
    second call bumps again, and that is harmless: the version is a counter, not
    a count of anything, and its only contract is that it changed. The
    alternative is a branch deciding whether to bump, and a branch there can be
    wrong in the permissive direction — which is the direction that leaves a
    working token on a dismissed employee's phone.

    So this route is a STATE request that performs an EVENT every time. It lands
    on the same state as often as it is called, unlike master._set_active, whose
    caller asks only for a state and which is idempotent for that reason.
    """
    if user_id == principal.user_id:
        # SELF-DEACTIVATION IS REFUSED, and note this is the OPPOSITE of
        # revoke_sessions above, which allows self-revocation deliberately. The
        # difference is recoverability: ending your own sessions costs you one
        # login, while locking your own account cannot be undone from inside the
        # system at all — /activate is require_admin, so an admin who locks
        # itself has no way back, and a shop whose only admin does it has nobody
        # left who can unlock it.
        #
        # DELIBERATELY NOT GUARDED HERE: the same hazard reached the other way,
        # by locking the LAST active admin rather than yourself. That needs a
        # count of active admins, and a count wrong in the refusing direction
        # locks a shop out of its own user management for a reason nobody can
        # see from a screen. Recorded in OPEN_ITEMS.md as the owner's decision,
        # with the cost, rather than guessed at here.
        raise forbidden(
            "cannot_deactivate_self",
            "an admin cannot deactivate their own account",
            user_id=str(user_id),
        )

    async with tenant_connection(principal.tenant_id) as conn:
        # NO hand-written `WHERE tenant_id`, for the reason revoke_sessions
        # gives above (hard rule 2): the RLS policy already restricts the visible
        # rows to the context tenant, so an admin of tenant A naming a user id in
        # tenant B matches NOTHING and this returns None -> 404.
        row = (
            await conn.execute(
                text(
                    "UPDATE users"
                    " SET is_active = false, token_version = token_version + 1"
                    " WHERE id = :id"
                    " RETURNING id, username, is_active, token_version"
                ),
                {"id": user_id},
            )
        ).mappings().first()

    return _user_or_404(row)


@router.post("/users/{user_id}/activate")
async def activate_user(
    user_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    """Unlock an account. The inverse of deactivate, and it is not optional.

    Migration 0004 added `activate` alongside `deactivate` for master data
    WITHOUT BEING ASKED, on the ground that deactivate with no undo is a trap:
    there is no delete either, so a mistyped retirement strands the row invisible
    forever. That argument is stronger for a person than for a product.

    NO BUMP HERE, and it is not an oversight. There are no sessions to end — the
    lock's own bump killed every token this user held, and none can have been
    minted since, because /auth/login refuses a locked account. The user signs in
    again and receives a token carrying the version the lock left behind.

    IDEMPOTENT, unlike deactivate. Activating an active account is a no-op that
    answers 200, which is the right answer to "make sure this account works" and
    stops a retried request from a flaky connection looking like a failure —
    master._set_active's reasoning, unchanged.

    NO SELF-CHECK, because the case cannot arise: reaching this handler needs a
    live session, and a deactivated account cannot have one.
    """
    async with tenant_connection(principal.tenant_id) as conn:
        row = (
            await conn.execute(
                text(
                    "UPDATE users SET is_active = true"
                    " WHERE id = :id"
                    " RETURNING id, username, is_active, token_version"
                ),
                {"id": user_id},
            )
        ).mappings().first()

    return _user_or_404(row)
