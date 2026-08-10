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

CREATING AN ACCOUNT IS A FOURTH THING, AND IT IS NEITHER OF THE TWO ABOVE
-------------------------------------------------------------------------
POST /users brings an account into existence. It is the only route in this
module that names no existing row — the other three take a user_id in the path
because they act on somebody who is already there. Until it existed an admin
holding a valid token could not bring a staff account into being at all, and the
only credentials a shop had were whatever seeded or installed it.

IT IS ROUTE 1 OF THREE, and the other two are not built. ARCHITECTURE.md § 10.
The three settled decisions D6 splits account provisioning into an admin creating
a user, an admin setting another user's password, and a user changing their own —
three ROUTES rather than one branching on who is calling, because the guard, the
request body and whose session dies all differ, and a branch deciding all three
from one inspection of the caller can be wrong in the permissive direction.

So this does NOT weaken the paragraph below. There is still no way for anybody to
CHANGE a password, their own or anyone else's; setting one at create is the only
password write in this system, and an account whose password is lost is an
account nothing in this product can recover.

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
from typing import Annotated, Any, Literal, get_args

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from .auth import ADMIN_ROLE, STAFF_ROLE, Principal, forbidden, require_admin
from .db import constraint_name_of, tenant_connection

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
#
# _conflict and _TENANT arrive on that same argument, and they are the two the
# create route below would otherwise have retyped:
#
#   _conflict is the 409 SHAPE — kind, code, entity, conflicting_code. A second
#   spelling of it here would be a second convention, drifting at the boundary
#   neither author tested. What is NOT imported is master's
#   _DUPLICATE_CODE_CONSTRAINTS table: that maps a constraint name to an entity
#   for master's own four tables, and teaching it about `users` would make
#   master.py depend on this module. The dependency runs one way, so the SHAPE
#   is imported and the one constraint name this file owns is named here.
#
#   _TENANT is the tenant_id every INSERT in this API writes: the same GUC
#   expression the RLS policy's WITH CHECK reads, so the value written and the
#   value tested are one thing and no handler passes a tenant_id at all. That is
#   hard rule 2 made structural rather than remembered, and a hand-typed copy of
#   it here is exactly the predicate that can be wrong.
#
# `Name` is imported rather than redeclared so a person's full name carries the
# same bound as every other human-typed name in this API. `Username` and
# `Password` are declared below instead, because their bounds are about a login
# credential and nothing in master.py means that.
from .master import Name, _TENANT, _active_filter, _conflict, _not_found
from .security import hash_password

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


# ---------------------------------------------------------------------------
# Creating an account
# ---------------------------------------------------------------------------
# CONSTRAINED HERE, AT THE EDGE, and here there is nothing underneath. master.py
# constrains its fields because the database's own limits are not all refusals —
# NUMERIC rounds an over-scale price instead of rejecting it
# (lessons/edge-must-reject-what-the-column-rounds.md). `users` is the stronger
# case: username, full_name and password_hash are bare `text` with NO length
# limit, and the database has NO password rule of any kind. Whatever this model
# admits is what gets stored, so a bound that is not declared here is not
# declared anywhere.
Username = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
]

# A MINIMUM LENGTH AND NOTHING ELSE — no character class, no dictionary check,
# no expiry, no reuse history. That is ARCHITECTURE.md § 10. The three settled
# decisions D9, and its reasoning is not about cryptography: the person typing
# this works a scrap yard with dirty hands, on their own phone, with a truck
# waiting. A composition rule does not produce a complex password, it produces
# one written on paper and taped to the scale — readable by everyone who walks
# past, still there after that person leaves, and invisible to every control this
# system has.
#
# THE NUMBER IS 8 AND IT CARRIES ITS PROVENANCE, because D9 chose the RULE and
# explicitly did not choose the number: "a length invented in passing by whoever
# writes D6's create route would be exactly the untraceable constant that ledger
# exists to prevent". It is not invented here. It was set by the owner in the
# brief for this phase, 2026-08-10, with no trial behind it — there is no
# experiment that could choose it, only a judgement — and it is named rather than
# inlined so the next reader finds one place to change and this sentence beside
# it.
PASSWORD_MIN_LENGTH = 8

# NOT A PASSWORD RULE, and D9's "nothing else" is not being widened here. This is
# a resource bound: argon2 hashing is deliberate CPU on a worker thread
# (app/security.py) and an unbounded field lets one request occupy one for as
# long as it likes. 128 is far above any passphrase a person types at a
# weighbridge, so no credential a human chooses can meet it.
PASSWORD_MAX_LENGTH = 128

# NO strip_whitespace, and that is the one difference from every other string in
# this API. Stripping a password SILENTLY CHANGES THE CREDENTIAL: the admin
# types "hunter2 ", the row stores the hash of "hunter2", and /auth/login — which
# strips nothing — refuses the password the person was given. Today that is
# permanent: D6's routes 2 and 3 do not exist, so nothing can change a password
# afterwards. A space is a character a password may contain.
Password = Annotated[
    str,
    StringConstraints(
        min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH
    ),
]

# READ OFF THE DATABASE'S OWN CHECK, not from memory: migration 0001 creates
# `role text NOT NULL CHECK (role IN ('admin', 'staff'))`. Declaring it here is
# master.py's Grade convention — a bad value is a 422 from pydantic, never a
# CheckViolation 500 from Postgres, and a 500 is `unavailable` to a client rather
# than `rejected` (lessons/unavailable-is-not-rejected.md).
Role = Literal["admin", "staff"]

# The two strings now have THREE spellings: the migration's CHECK, auth.py's
# ADMIN_ROLE/STAFF_ROLE, and the Literal above. auth.py's own comment binds its
# pair to the migration. This binds the third, and the failure it closes is
# silent: rename a constant in auth.py and this route would go on minting rows
# whose role no gate recognises — accounts that authenticate and are refused
# everything, with nothing anywhere reporting a fault.
#
# RuntimeError at import, never `assert`: `python -O` strips asserts, and this is
# the same fail-closed-at-import shape config.py uses for an empty JWT_SECRET.
if set(get_args(Role)) != {ADMIN_ROLE, STAFF_ROLE}:  # pragma: no cover
    raise RuntimeError(
        "users.Role and auth.ADMIN_ROLE/STAFF_ROLE have diverged:"
        f" {sorted(get_args(Role))} != {sorted({ADMIN_ROLE, STAFF_ROLE})}."
        " Both must equal migration 0001's CHECK (role IN ('admin','staff'))."
    )


class UserCreate(BaseModel):
    """Everything the row needs that the database will not supply itself.

    FOUR FIELDS, and the ones that are absent are the decisions:

    NO tenant_id, and it is not an omission a caller may correct — extra="forbid"
    refuses the field rather than ignoring it. The tenant comes from the caller's
    own token by way of _TENANT, so "create this user in that shop" is not a
    request this route can express, let alone honour.

    NO is_active. A new account is active; that is migration 0007's DEFAULT true,
    and an account born locked is a thing nothing asked for. /deactivate is one
    request away for anyone who wants one.

    NO token_version. Migration 0005's DEFAULT is 1 and its CHECK forbids 0, and
    that pairing is load-bearing: no row may ever hold the value an absent claim
    would default to. Writing a version here would make this route a second
    author of that invariant.

    NO user_id. The column defaults to gen_random_uuid(); a client-supplied id is
    hard rule 3's rule for BILLS, which are written offline on a device that has
    no server to ask. An account is created online, by an admin, or not at all.
    """

    model_config = ConfigDict(extra="forbid")
    username: Username
    full_name: Name
    role: Role
    password: Password


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate, principal: Principal = Depends(require_admin)
) -> dict:
    """Bring an account into existence. ADMIN ONLY.

    Same tier as every other route in this module, and for once that needs no
    argument of its own: if a yard phone could create an account it could create
    an ADMIN account, and every gate in this API would then be one request away
    from being nobody's.

    AN ADMIN MAY CREATE ANOTHER ADMIN — ARCHITECTURE.md § 10. The three settled
    decisions D7. That is deliberate and it is the reason `role` is a caller's
    choice rather than a constant. A shop whose single admin loses their handset
    has nobody who can sign in as an admin: /activate, /revoke-sessions and this
    route are all require_admin, and there is no password reset, no recovery
    address and no support path that speaks HTTP — the only way back in today is
    somebody running SQL on site. provision_shop.py is not a way back either: it
    creates a shop's FIRST admin from an installer's shell and refuses a second
    run. A second admin is the cheap version of that insurance, and the shop must
    be able to make one without us. Without this paragraph the next reader sees a
    hole.

    THE COST, STATED AND NOT ARGUED AWAY, because D7 states it: admin is the tier
    that voids bills and moves prices, so an admin who creates a second admin has
    handed over every capability they hold, permanently and with NO AUDIT TRAIL —
    D3's log does not exist. The role is a two-value CHECK, not a permission
    system, so there is no weaker admin to create instead. The same capability
    also lets a compromised admin session mint a persistent admin of its own,
    which is not a new door — such a session can already void every bill and
    re-price the shop — but it does change how long an intruder keeps access
    after the original account is locked.

    THE FIRST PASSWORD IS NOT FORCED TO CHANGE ON FIRST USE, and that absence is
    a DECISION, not an omission — D8, which asks in its own text that a later
    session not read it as an oversight. This route therefore issues no
    provisional credential and records no "must change" state; there is no third
    account state and no column for one.

    WHAT D8 RESTS ON DOES NOT EXIST YET, and this is the sentence to carry out of
    here: D8 is acceptable BECAUSE a staff member may change their own password
    at any time (D6's route 3) — and route 3 is not built. Until it is, the first
    password is known to two people permanently, and the only account state a
    shop can reach for is /deactivate. That is a consequence of shipping route 1
    first, not a defect of this route, and it is what makes the password routes
    the next phase rather than a later one.

    NO hand-written `WHERE tenant_id`, and NO tenant_id from the caller (hard
    rule 2). tenant_connection issues SET LOCAL from the TOKEN's tenant; the
    INSERT writes _TENANT, which is that same GUC read back; and the RLS policy's
    WITH CHECK compares the new row against it. So an admin of tenant A creating
    a user is structurally incapable of landing it anywhere but tenant A — there
    is no predicate here to get wrong and no argument here to get wrong.

    THE RESPONSE IS THE ROSTER'S FIVE KEYS, _user_payload unchanged, and the two
    it withholds are the point. NO password (nothing echoes a credential), NO
    password_hash, and NO token_version — that last one is the decision, because
    the three routes below DO return it. They return it because their caller is
    reading the effect of their own action ON SESSIONS: a bump moved the number,
    a lock moved it in the same statement, an unlock deliberately did not. This
    route ends no session and moves no version; the row is born at the column's
    DEFAULT. There is nothing for a caller to observe, which leaves only the bad
    use _user_payload names — a client re-deriving get_principal's equality check
    for itself, stale and as an ordering comparison.

    THE PASSWORD IS HASHED BEFORE THE CONNECTION IS OPENED. argon2 is deliberate
    CPU and it runs in a worker thread; hashing inside the transaction would hold
    a pooled connection open across it for no reason. It also means a duplicate
    username costs exactly what a successful create costs, so nothing here times
    differently for a name that is taken.

    409 ON A DUPLICATE USERNAME, in master.py's existing shape, because
    uq_users_tenant_username (migration 0001) is per TENANT: two shops may both
    have a `somchai` and neither may have two. Anything else keeps its 500 —
    _raise_for_integrity's rule, applied here: a name this file does not
    recognise is a genuine surprise and must not be dressed up as a client error
    we understood.

    WHAT THIS ROUTE DOES NOT DO. It does not change a password — nobody can, in
    this system, including the person who owns one. It does not delete, here or
    anywhere. It issues no provisional or temporary credential: the password the
    admin types is the password the person is given, and it is on the admin to
    hand it over out of band.
    """
    # OUTSIDE the transaction — see the docstring.
    password_hash = await hash_password(body.password)

    async with tenant_connection(principal.tenant_id) as conn:
        try:
            row = (
                await conn.execute(
                    text(
                        f"INSERT INTO users"
                        f" (tenant_id, username, full_name, role, password_hash)"
                        f" VALUES ({_TENANT}, :username, :full_name, :role, :ph)"
                        f" RETURNING id, username, full_name, role, is_active"
                    ),
                    {
                        "username": body.username,
                        "full_name": body.full_name,
                        "role": body.role,
                        "ph": password_hash,
                    },
                )
            ).mappings().one()
        except IntegrityError as e:
            # BY NAME, through db.constraint_name_of — never `exc.orig
            # .constraint_name`, which is ABSENT on this stack and reads as ""
            # for every violation
            # (lessons/a-defaulted-getattr-is-a-silent-dead-branch.md). A blanket
            # `except IntegrityError -> 409` would report "that username is
            # taken" for a tenant_id FK violation or anything else that ever
            # lands here, which is a confident lie about a cause.
            if constraint_name_of(e) == "uq_users_tenant_username":
                raise _conflict("user", body.username) from e
            raise

    return _user_payload(row)


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
