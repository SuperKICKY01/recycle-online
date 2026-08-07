"""Account state and session state: the two things an admin may do to a user.

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
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text

from .auth import Principal, forbidden, require_admin
from .db import tenant_connection

# The refusal vocabulary is master.py's and is IMPORTED rather than restated.
# An error shape is a CONVENTION, and a second copy of a convention drifts at
# the boundary neither author tested — lessons/a-checker-must-not-share-the-code
# -it-checks.md draws exactly this line (duplicate arithmetic, never duplicate a
# convention). It wants its own module eventually; that refactor is recorded in
# OPEN_ITEMS.md and is deliberately not done here.
from .master import _not_found

router = APIRouter()


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
