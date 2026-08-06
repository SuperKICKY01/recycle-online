"""Session revocation: end a user's live sessions without deleting anything.

THIS ENDPOINT IS A STOPGAP AND IS LABELLED ONE ON PURPOSE.
----------------------------------------------------------
The design calls for `users.token_version` to be bumped on TWO events: a
password change and a user deactivation. Neither exists in this system. There
is no `/users` route of any kind, no password endpoint, and `users` has no
`is_active` column — `is_active` (migration 0004) covers sellers, products,
uoms and product_categories only. So there is nothing to hang the bump on, and
a revocation mechanism with no trigger is a mechanism nobody can use.

This is the smallest thing that gives it a trigger: one admin-only endpoint
that bumps the counter. When a real password-change or user-deactivation
endpoint is built, IT should bump the version as part of its own work, and this
route becomes redundant rather than load-bearing.

WHAT IT DOES NOT DO, STATED PLAINLY
-----------------------------------
It ends live SESSIONS. It does NOT lock the account. `users` has no is_active
column, so the user can sign in again the same second and receive a fresh token
carrying the new version. That is the correct behaviour for a handover ("this
handset's session is over") and the WRONG behaviour for a dismissal ("this
person may no longer sign in") — and there is currently no way to express the
second. Do not describe this endpoint as disabling a user.

It also cannot reach a bill that has already been written. Nothing here changes
what a purchase_bill records, and purchase_bills records no author at all (see
OPEN_ITEMS.md); revoking a session refuses the FUTURE use of a credential.

SELF-REVOCATION IS ALLOWED. An admin may end their own sessions, and their very
next request 401s. That is the honest meaning of "end this user's sessions",
and refusing it would be an invented rule — "sign out everywhere" is a
legitimate thing for an owner to want.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import text

from .auth import Principal, require_admin
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
