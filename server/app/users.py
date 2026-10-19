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

IT IS ROUTE 1 OF THREE, and as of 2026-08-10 ALL THREE EXIST. ARCHITECTURE.md
§ 10. The three settled decisions D6 splits account provisioning into an admin
creating a user, an admin setting another user's password, and a user changing
their own — three ROUTES rather than one branching on who is calling, because the
guard, the request body and whose session dies all differ, and a branch deciding
all three from one inspection of the caller can be wrong in the permissive
direction.

**THIS PARAGRAPH SAID THE OTHER TWO WERE NOT BUILT, AND SO DID FIVE OTHERS IN
THIS FILE.** They were true when route 1 landed and false one commit later; they
are corrected where they stand rather than left for a reader who would believe
whichever they reached first. What each said, and what is true now: there IS a
way to change a password, by POST /users/me/password and POST
/users/{user_id}/password at the foot of this module; an account whose password
is lost can be RESET BY AN ADMIN, though one whose only admin loses theirs still
cannot be recovered from inside the system.

WHAT IS STILL A STOPGAP, AND WHAT NO LONGER IS
-----------------------------------------------
The design calls for `users.token_version` to be bumped on TWO events: a
password change and a user deactivation. DEACTIVATION NOW EXISTS and bumps it
here, as prescribed. **THE PASSWORD HALF IS NO LONGER A STOPGAP EITHER** — this
read "A password endpoint still does not exist anywhere in this system, so
revoke-sessions keeps its original job for that half" until 2026-08-10, and both
password routes now bump the version in the SAME UPDATE as the hash, exactly as
the sentence below asked them to.

revoke-sessions is not redundant, and the reason is the job neither password
route can do: ending a session on a HANDOVER, where the account must go on
working afterwards and its holder must not be given a new password to learn. It
is now the only one of the three that ends a session and leaves the credential
alone.

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

A LARGER VERSION OF THAT HAZARD IS NOW GUARDED — locking the last remaining
active admin. SUPERSEDED 2026-09-02: this paragraph read "DELIBERATELY NOT
GUARDED … Recorded in OPEN_ITEMS.md as the owner's decision, with that cost
stated", and BOTH halves were wrong. The pointer was dangling — no such
OPEN_ITEMS entry existed — so the comment borrowed an authority it never had and
protected the gap for months. And the cost it stated (a count wrong in the
refusing direction locking a shop out) does not survive scrutiny: an over-refusal
just fails to deactivate an admin, which is recoverable, while NO guard fails as a
shop with zero admins, which is not. The owner reversed it 2026-09-02 on that
asymmetry. The guard lives in deactivate_user below and is REACHABLE ONLY UNDER A
CONCURRENT RACE — serially the self-deactivation refusal already prevents zero
admins; its body carries the full argument, and OPEN_ITEMS.md § Decisions open
"LAST-ACTIVE-ADMIN — the server now guards it" carries the decision and the
dangling-pointer discovery.
"""
from __future__ import annotations

import uuid
from collections.abc import Mapping
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from . import login_guard
from .auth import Principal, forbidden, get_principal, require
from .db import constraint_name_of, tenant_connection
from .permissions import OWNER_ROLE, Permission

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
from .master import Name, _TENANT, _active_filter, _conflict, _invalid, _not_found
from .security import hash_password, verify_password

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
        # The role CODE (roles.code since 0019: owner, admin, staff, or one the
        # shop minted). The same five keys as before 0019; the value for every
        # pre-0019 account is the string it held in users.role.
        "role": r["role"],
        "is_active": r["is_active"],
    }


# The roster's SELECT. users.role is gone (0019): the code comes through the
# join, and `u.is_active` is qualified because roles carries an is_active too.
_USER_SELECT = (
    "SELECT u.id, u.username, u.full_name, r.code AS role, u.is_active"
    " FROM users u JOIN roles r ON r.id = u.role_id"
)


@router.get("/users")
async def list_users(
    include_inactive: IncludeInactiveUsers = False,
    principal: Principal = Depends(require(Permission.USERS_MANAGE)),
) -> dict:
    """The shop's people. users.manage ONLY (0019; was ADMIN ONLY) — and that
    BREAKS the convention on purpose.

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
    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
        rows = (
            await conn.execute(
                text(
                    f"{_USER_SELECT}{_active_filter(include_inactive, column='u.is_active')}"
                    f" ORDER BY u.username"
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
# strips nothing — refuses the password the person was given. This read "Today
# that is permanent: D6's routes 2 and 3 do not exist" until 2026-08-10; it is
# now recoverable, by an admin reset or by the person themselves, and the field
# still must not strip. A space is a character a password may contain.
Password = Annotated[
    str,
    StringConstraints(
        min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH
    ),
]

# A ROLE IS A CODE THE SHOP HOLDS, NOT A COMPILE-TIME SET (migration 0019). This
# read `Role = Literal["admin", "staff"]` bound to 0001's CHECK until 0019
# replaced the CHECK with a per-tenant `roles` table, exactly as 0015 did for
# the grade letters — and a set a shop chooses at run time cannot be a Literal.
# The edge bounds only the SHAPE (the same 1..32 bound ck_roles_code_len holds);
# create_user resolves the code against the caller's OWN tenant's active roles
# and answers a readable 422 (`role_unknown`, field=role) for one that is not
# there, never the FK's 500. The import-time guard that bound the three
# spellings of admin/staff is gone with the constants it bound; what holds the
# set equal to the code now is the boot-time catalogue check
# (app/permissions.py), which is about permissions, not role names — a role
# name is no longer anything a gate reads.
RoleCode = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)
]


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
    role: RoleCode
    password: Password


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate, principal: Principal = Depends(require(Permission.USERS_MANAGE))
) -> dict:
    """Bring an account into existence. users.manage ONLY (0019; was ADMIN ONLY).

    Same tier as every other route in this module, and for once that needs no
    argument of its own: if a yard phone could create an account it could create
    an ADMIN account, and every gate in this API would then be one request away
    from being nobody's.

    THE ESCALATION GUARD (0019, the owner's decision 6). A caller may assign
    only a role whose permission set is a SUBSET of their own. Without it, the
    day an owner role exists an admin mints one and takes the shop: the owner's
    set holds roles.manage and the admin's does not, so the admin cannot. The
    refusal is 403 `role_exceeds_caller`, naming the role and, in `over_reach`,
    every permission the caller lacks — so a reader of the log sees WHAT was over-
    reached, never just that something was. Proven by prove_permissions.py (the
    admin-mints-owner cell), whose named disproof is deleting the subset check.

    THE ROLE IS RESOLVED UNDER THE CALLER'S OWN TENANT CONTEXT, by code, against
    ACTIVE roles: RLS makes another shop's roles invisible, so a code that exists
    only elsewhere is `role_unknown` (422, field=role) exactly like one that
    exists nowhere. A deactivated role is not assignable either — an account
    born holding nothing is a thing nothing asked for.

    AN ADMIN MAY CREATE ANOTHER ADMIN — ARCHITECTURE.md § 10. The three settled
    decisions D7. That is deliberate and it is the reason `role` is a caller's
    choice rather than a constant. A shop whose single admin loses their handset
    has nobody who can sign in as an admin: /activate, /revoke-sessions and this
    route are all gated on users.manage, and there is no password reset, no recovery
    address and no support path that speaks HTTP — the only way back in today is
    somebody running SQL on site. provision_shop.py is not a way back either: it
    creates a shop's FIRST admin from an installer's shell and refuses a second
    run. A second admin is the cheap version of that insurance, and the shop must
    be able to make one without us. Without this paragraph the next reader sees a
    hole.

    THE COST, STATED AND NOT ARGUED AWAY, because D7 states it: admin is the tier
    that voids bills and moves prices, so an admin who creates a second admin has
    handed over every capability they hold, permanently. SUPERSEDED IN TWO
    CLAUSES since this was written: D3's log EXISTS (migration 0017 audits every
    users write with its actor), and since 0019 the role is a per-tenant row
    rather than a two-value CHECK, so a WEAKER role can be created once the role
    screen exists — and the escalation guard above is what stops the reverse.
    The same capability also lets a compromised admin session mint a persistent
    admin of its own, which is not a new door — such a session can already void
    every bill and re-price the shop — but it does change how long an intruder
    keeps access after the original account is locked.

    THE FIRST PASSWORD IS NOT FORCED TO CHANGE ON FIRST USE, and that absence is
    a DECISION, not an omission — D8, which asks in its own text that a later
    session not read it as an oversight. This route therefore issues no
    provisional credential and records no "must change" state; there is no third
    account state and no column for one.

    WHAT D8 RESTS ON NOW EXISTS. This paragraph read "WHAT D8 RESTS ON DOES NOT
    EXIST YET… route 3 is not built. Until it is, the first password is known to
    two people permanently" until 2026-08-10, and it named the password routes as
    the next phase for exactly this reason. They are built: POST
    /users/me/password lets the person it belongs to change it whenever they
    like, with no admin and no request, which is the whole of what D8's argument
    rested on.

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

    WHAT THIS ROUTE DOES NOT DO. It does not change a password — this read "nobody
    can, in this system, including the person who owns one" until 2026-08-10, and
    the two routes at the foot of this module now do it; what stands is that THIS
    route only ever sets the FIRST one. It does not delete, here or anywhere. It
    issues no provisional or temporary credential: the password the admin types is
    the password the person is given, and it is on the admin to hand it over out
    of band.
    """
    # OUTSIDE the transaction — see the docstring.
    password_hash = await hash_password(body.password)

    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
        # THE ROLE, by code, among this tenant's ACTIVE roles (RLS scopes the
        # table). Its grants are read in the same transaction for the subset
        # check below.
        role = (
            await conn.execute(
                text("SELECT id FROM roles WHERE code = :code AND is_active"),
                {"code": body.role},
            )
        ).mappings().first()
        if role is None:
            raise _invalid(
                "role_unknown",
                "ไม่พบสิทธิ์การใช้งานนี้ในร้าน",
                field="role",
                role=body.role,
            )
        granted = set(
            (
                await conn.execute(
                    text("SELECT permission FROM role_permissions WHERE role_id = :r"),
                    {"r": role["id"]},
                )
            )
            .scalars()
            .all()
        )
        # THE ESCALATION GUARD. Set difference, so the refusal names exactly
        # what the caller does not hold. DELETE THIS BLOCK and an admin mints an
        # owner — prove_permissions.py's named disproof.
        over_reach = sorted(granted - principal.permissions)
        if over_reach:
            raise forbidden(
                "role_exceeds_caller",
                "ไม่สามารถกำหนดสิทธิ์ที่สูงกว่าสิทธิ์ของตนเองได้",
                role=body.role,
                over_reach=over_reach,
            )
        try:
            row = (
                await conn.execute(
                    text(
                        f"INSERT INTO users"
                        f" (tenant_id, username, full_name, role_id, password_hash)"
                        f" VALUES ({_TENANT}, :username, :full_name, :role_id, :ph)"
                        f" RETURNING id, username, full_name, is_active"
                    ),
                    {
                        "username": body.username,
                        "full_name": body.full_name,
                        "role_id": role["id"],
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

    # The role code is the one resolved above, in the same transaction the row
    # was written in -- the roster's five keys, unchanged.
    return _user_payload({**row, "role": body.role})


@router.post("/users/{user_id}/revoke-sessions")
async def revoke_sessions(
    user_id: uuid.UUID, principal: Principal = Depends(require(Permission.USERS_MANAGE))
) -> dict:
    """Bump this user's token_version: every token issued to them stops working.

    users.manage ONLY. Ending another person's session is an act of authority over an
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
    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
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
    user_id: uuid.UUID, principal: Principal = Depends(require(Permission.USERS_MANAGE))
) -> dict:
    """Lock an account: it can no longer sign in, and its live sessions end now.

    users.manage ONLY — the same class of authority as revoking a session or
    voiding a bill, and not something a yard phone may do to any user.

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

    IT ALSO REFUSES DEACTIVATING THE LAST ACTIVE ADMIN (409 `last_active_admin`),
    added 2026-09-02. That refusal is reachable ONLY under a concurrent race —
    serially the self-check above already prevents a shop reaching zero admins —
    and the guard body says why a lock, not a plain count, is what makes it real.
    GENERALISED BY 0019: "admin" here means the last ACTIVE user holding
    `users.manage` through an ACTIVE role, whatever that role is called; the
    code and the message keep their names because that is the shop's word for it.
    """
    if user_id == principal.user_id:
        # SELF-DEACTIVATION IS REFUSED, and note this is the OPPOSITE of
        # revoke_sessions above, which allows self-revocation deliberately. The
        # difference is recoverability: ending your own sessions costs you one
        # login, while locking your own account cannot be undone from inside the
        # system at all — /activate needs users.manage, so an admin who locks
        # itself has no way back, and a shop whose only admin does it has nobody
        # left who can unlock it.
        #
        # This self-check IS the serial guarantee against the LARGER hazard —
        # locking the last active admin — because reaching zero active admins in a
        # single request means the target is the caller (see the guard below for
        # why), which lands here. The concurrent race the self-check cannot see is
        # closed by the locked guard below. SUPERSEDED 2026-09-02: this comment
        # read "DELIBERATELY NOT GUARDED HERE … Recorded in OPEN_ITEMS.md as the
        # owner's decision"; that pointer was dangling (no such entry existed) and
        # the decision is now reversed — OPEN_ITEMS.md § Decisions open
        # "LAST-ACTIVE-ADMIN — the server now guards it".
        raise forbidden(
            "cannot_deactivate_self",
            "an admin cannot deactivate their own account",
            user_id=str(user_id),
        )

    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
        # LAST-ACTIVE-ADMIN GUARD. A shop must always keep at least one active
        # admin: a shop with zero cannot sign in to its own user management, void
        # a bill or move a price, and there is NO recovery inside the product —
        # only SQL on site. This is master.update_grade_tier's last-active
        # invariant (code `grade_tier_last_active`, shipped 2026-08-31, which is
        # what proved counting the last active member is simple and safe) applied
        # to a far worse consequence: a shop with zero tiers still has a signed-in
        # admin to add one; a shop with zero admins has nobody.
        #
        # WHAT THIS DOES *NOT* GUARD, BECAUSE SOMETHING ELSE ALREADY DOES. No
        # SERIAL request can reach zero active admins. The caller passed
        # the users.manage gate, so IS an active holder this request; a deactivate targets
        # one user_id; if it is the caller, cannot_deactivate_self above already
        # refused; if it is anyone else, the caller's own row is untouched and
        # stays an active admin. So `user_id` being the SOLE active admin implies
        # `user_id == caller`, which the self-check caught — this branch is
        # unreachable through any single request. cannot_deactivate_self IS the
        # serial guarantee.
        #
        # WHAT IT DOES GUARD: the CONCURRENT race. Admins A and B each deactivate
        # the other in overlapping transactions. Without serialisation both read
        # two active admins, both proceed, both commit — zero admins, unrecoverable.
        # A plain `SELECT count(*)` (grade_tier_last_active's exact shape) would be
        # FALSE ASSURANCE here: never fires serially (self-check first) and does not
        # stop the race (READ COMMITTED lets both racers read count=2 before either
        # commits). The LOCK is the whole mechanism. See OPEN_ITEMS.md § Decisions
        # open "LAST-ACTIVE-ADMIN — the server now guards it".
        #
        # BEFORE YOU SIMPLIFY THIS LOCK, read what happens without it. Because no
        # serial path reaches this branch, its ONLY direct evidence is the disproof
        # in prove_user_admin.py: drop ` FOR NO KEY UPDATE` and cell C2 returns 200
        # (the loser is not refused) and C3 reads ZERO active admins — the shop is
        # locked out of its own management. That reading is this guard's
        # documentation, not a step in building it.
        #
        # WHY `FOR NO KEY UPDATE`, NOT `FOR UPDATE`, and it is not a detail: a
        # concurrent POST /bills by an admin takes FOR KEY SHARE on that admin's
        # users row for its (tenant_id, created_by) FK check, and FOR UPDATE
        # conflicts with FOR KEY SHARE while FOR NO KEY UPDATE does not — the
        # measured argument in master._lock_shop_for_code_assignment (PostgreSQL
        # 16.14, 2026-08-24). This UPDATE touches no key column so it takes FOR NO
        # KEY UPDATE anyway; the explicit lock matches it and adds no new conflict.
        # It serialises exactly the other admin-row writers (a racing deactivate,
        # revoke or password reset) and nothing else — a plain-SELECT login never
        # blocks on it, and a bill by an admin does not either.
        #
        # NO hand-written `WHERE tenant_id` (hard rule 2): RLS scopes the set to
        # the caller's tenant, so this locks and counts only THIS shop's admins.
        #
        # THE SET IS "ACTIVE USERS HOLDING users.manage THROUGH AN ACTIVE ROLE"
        # (0019) — the generalisation of `role = 'admin'`. `FOR NO KEY UPDATE OF
        # u` locks the users rows and ONLY them: locking the roles or grant rows
        # the join walks would serialise this route against an unrelated grant
        # edit, and the set the race can zero is the set of USERS.
        active_admin_ids = set(
            (
                await conn.execute(
                    text(
                        "SELECT u.id FROM users u"
                        " JOIN roles r ON r.id = u.role_id AND r.is_active"
                        " JOIN role_permissions rp ON rp.role_id = r.id"
                        "  AND rp.permission = :perm"
                        " WHERE u.is_active"
                        " ORDER BY u.id"
                        " FOR NO KEY UPDATE OF u"
                    ),
                    {"perm": Permission.USERS_MANAGE.value},
                )
            )
            .scalars()
            .all()
        )
        # `active_admins` in the detail is the count read UNDER THE LOCK at refusal
        # time — 1, the target itself, the last one; allowing this would leave 0.
        # The loser of the race re-reads the set here after the winner commits, sees
        # the winner already dropped (EPQ re-evaluates `is_active` on the locked
        # rows), and finds its own target is now the only member. The screen keys
        # its sentence on the CODE, never this number (here for diagnosis and for
        # parity with grade_tier_last_active's `active_tiers`).
        if user_id in active_admin_ids and len(active_admin_ids) == 1:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail={
                    "kind": "conflict",
                    "code": "last_active_admin",
                    "message": (
                        "ร้านต้องมีผู้ดูแลระบบที่เปิดใช้งานอย่างน้อยหนึ่งคน "
                        "จึงปิดผู้ดูแลระบบคนสุดท้ายไม่ได้ — เพิ่มผู้ดูแลระบบอีกคนก่อน"
                    ),
                    "entity": "user",
                    "active_admins": str(len(active_admin_ids)),
                    "permission": Permission.USERS_MANAGE.value,
                },
            )

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
    user_id: uuid.UUID, principal: Principal = Depends(require(Permission.USERS_MANAGE))
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
    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
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


@router.post("/users/{user_id}/unlock-login")
async def unlock_login(
    user_id: uuid.UUID, principal: Principal = Depends(require(Permission.USERS_MANAGE))
) -> dict:
    """Clear the temporary LOGIN LOCKOUT on an account. users.manage ONLY.

    NOT the same thing as /activate, and the two must not be confused. /activate
    clears is_active, the DURABLE admin lock; this clears the TRANSIENT lockout
    that repeated failed logins build up in failed_login_attempts (migration
    0016). An account can be under one, the other, both, or neither: they answer
    different questions, and this route touches only the failure counter, never
    is_active. login_guard's module docstring draws the line in full.

    WHY IT EXISTS ALONGSIDE THE AUTO-EXPIRY. The lockout clears itself once the
    failures age out of the window, which is the recovery path for a shop whose
    only admin locks itself out with nobody to call. This route is the OTHER
    recovery: an admin unlocking a STAFF account NOW, without making them wait out
    the window — the same authority as deactivating or resetting an account, so
    the same users.manage tier as the rest of this module.

    IT IS ALSO THE AUTHENTICATED DISCLOSURE CHANNEL. POST /auth/login refuses a
    locked account byte-identically to a wrong password on purpose, so nothing the
    refused caller sees says "locked". The admin is on a different channel, and
    this response tells them the state — how many failures counted, and whether
    that had crossed the threshold — the same way /deactivate's own 200 is how an
    admin observes a lock the refused caller cannot.

    AN UNLOCK IS AN APPEND, NEVER A DELETE. clear_lockout writes an
    `unlocked_by_admin` marker and the count query ignores everything at or before
    it. The append-only table has no DELETE grant to the app role, and this route
    needs none: the whole mechanism is additive.

    404, NOT 403, on an unknown id — the doctrine revoke_sessions states and the
    other account routes follow: from inside this tenant the row does not exist,
    and answering "forbidden" would confirm some other shop holds a user with that
    id. The lockout is keyed on the username, so the id is resolved to a username
    UNDER the admin's own tenant context first; an id in another tenant matches
    nothing and 404s, and the marker can only ever land in the admin's own tenant.

    IDEMPOTENT ENOUGH: a second call on an already-clear account writes a second
    marker and reports zero cleared. Harmless — a marker only ever moves the
    count's floor forward, and there is nothing to get wrong in the permissive
    direction because clearing a lockout that is not there is a no-op the login
    path already allows.
    """
    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
        urow = (
            await conn.execute(
                text("SELECT id, username FROM users WHERE id = :id"),
                {"id": user_id},
            )
        ).mappings().first()
        if urow is None:
            raise _not_found("user")
        username = urow["username"]
        # BEFORE the reset, so the admin sees the state that was there. Both the
        # read and the append run under the admin's TOKEN tenant, and the block
        # returns 200 normally, so the marker commits with it.
        before = await login_guard.recent_failure_count(conn, username)
        await login_guard.clear_lockout(conn, username)

    return {
        "user_id": str(urow["id"]),
        "username": username,
        "was_locked": before >= login_guard.FAILURE_THRESHOLD,
        "failed_attempts_cleared": before,
    }


# ---------------------------------------------------------------------------
# Changing a password — D6's routes 2 and 3, and the stopgap this module has
# carried since 0005 finally stops being one
# ---------------------------------------------------------------------------
# THE MODULE ASKED FOR THIS AND SAID WHAT IT MUST DO. "The design calls for
# `users.token_version` to be bumped on TWO events: a password change and a user
# deactivation… When a password-change endpoint is built, IT should bump the
# version as part of its own work, exactly as deactivate does." Both routes below
# do that, in the SAME UPDATE as the hash, for the reason deactivate_user gives:
# one statement leaves no window in which the credential has changed and the
# sessions it minted have not.
#
# revoke-sessions IS NOT MADE REDUNDANT, and the module already said why: it is
# the only one of the three that ends a session while leaving the credential
# alone, which is what a HANDOVER needs. Nothing here replaces it.


# A CONSTRAINT, NOT THE PASSWORD RULE, and the difference decides who is locked
# out. PASSWORD_MIN_LENGTH is about what this API is willing to STORE; this field
# carries what the caller is asking us to CHECK, and it may predate the rule —
# provision_shop.py reads the first admin's password from the environment and
# applies no minimum, so an account can legitimately hold a shorter one. Requiring
# eight here would refuse that person the one route that could fix it. The maximum
# stays, because it is a bound on argon2's work rather than a rule about
# credentials.
CurrentPassword = Annotated[
    str, StringConstraints(min_length=1, max_length=PASSWORD_MAX_LENGTH)
]


def _bad_request(code: str, message: str, **context: Any) -> HTTPException:
    """400: the request is well-formed, and a VALUE in it is wrong.

    THE ENVELOPE IS THE CONVENTION AND IS REPRODUCED EXACTLY — kind, code,
    message, then context — so nothing here is a second SHAPE. What is new is the
    status and the kind, and a new kind needs a reason, because this module's own
    import comment argues against second copies of anything.

    THE REASON: none of the five kinds already in play means this. 401
    `unauthenticated` says the caller is nobody, and this caller is somebody with
    a live session. 403 `forbidden` says no action of theirs can clear it, and
    typing the right password clears this immediately. 404 `not_found` is about a
    row. 409 `conflict` is about a value already taken. 422 `invalid_request` is
    for a payload that CAN NEVER BE VALID — and this payload is valid, it is the
    submitted credential that does not match, so the same request with the right
    password succeeds. Answering 422 would put "you typed your password wrong"
    into the class the sync engine treats as permanently rejected.
    400 IS ALREADY CONTRACTED ON THE CLIENT SIDE: mobile/src/adapters/
    httpTransport.ts classifies 400 with 422 as `rejected: terminal`, so this
    status is not an unknown arriving at a device that has no branch for it.
    """
    return HTTPException(
        status.HTTP_400_BAD_REQUEST,
        detail={"kind": "bad_request", "code": code, "message": message, **context},
    )


def _session_payload(r: Mapping[str, Any]) -> dict:
    """The three keys both password routes answer with.

    `token_version` rides in the body for the reason revoke_sessions gives about
    its own: the caller is reading the effect of their own action on one named
    row, and the number is how they see that the sessions went. Its contract is
    that it CHANGED, never its value.

    ONE helper for the two routes below rather than a copy in each. It is
    deliberately NOT applied to revoke_sessions, which builds the identical dict
    inline: that endpoint's shape is already proven by prove_revocation.py, and
    rewriting a proven endpoint for tidiness is the same change _user_or_404's
    docstring declined to make for the same reason.
    """
    return {
        "user_id": str(r["id"]),
        "username": r["username"],
        "token_version": r["token_version"],
    }


class SelfPasswordChange(BaseModel):
    """The caller's own password. TWO fields, and both are secrets.

    NO user_id — the caller IS the target, which is D6's whole argument for three
    routes rather than one branching on who is asking. A body that could name
    somebody else is one missing `if` away from setting a colleague's password.
    """

    model_config = ConfigDict(extra="forbid")
    current_password: CurrentPassword
    new_password: Password


class AdminPasswordReset(BaseModel):
    """An admin setting somebody else's password. The target is in the PATH.

    NO current_password, and that is the point of the route: an admin resetting a
    dismissed employee's account does not know their password, and if they did,
    the account would not need resetting.
    """

    model_config = ConfigDict(extra="forbid")
    new_password: Password


# DECLARED BEFORE /users/{user_id}/password, AND THE ORDER IS LOAD-BEARING.
# Starlette matches routes in registration order and `{user_id}` has no converter
# in the path string, so it would swallow the literal `me` — the request would
# reach the ADMIN route with "me" as its user_id and be refused 422 for a
# malformed uuid, or 403 for a staff caller who is entitled to this route. Both
# are the wrong answer, and neither looks like a routing fault.
@router.post("/users/me/password")
async def change_own_password(
    body: SelfPasswordChange, principal: Principal = Depends(get_principal)
) -> dict:
    """Change your own password. ANY authenticated caller — this one is not admin.

    D6's route 3, and the only route in this module a staff phone may call. It has
    to be: D8 accepts that a first password is known to two people BECAUSE the
    person it belongs to can change it whenever they like, and until this existed
    that sentence rested on nothing.

    YOUR OWN SESSION DIES, IMMEDIATELY AND ON PURPOSE, and the module already
    settled which side of that question this sits on. Self-revocation is ALLOWED
    here — "their very next request 401s… the cost of being wrong is one login" —
    while self-deactivation is REFUSED, and the difference the module names is
    RECOVERABILITY: a locked admin cannot unlock itself, so that door has no way
    back. This one does: sign in again with the password you just set. A password
    change is therefore the self-revocation case, not the self-deactivation case,
    and refusing it would be the invented rule that docstring warns about.

    It is also the behaviour the change is FOR. If your password is being changed
    because somebody watched you type the old one, a route that left every session
    it had minted alive would have changed a string and nothing else.

    ONE UPDATE, NOT TWO — deactivate_user's rule, applied to the other event 0005
    named. The hash and the bump move in the same statement, so there is no window
    in which the new credential is live and the old sessions are too.

    THE SAME PASSWORD AGAIN IS ACCEPTED, NOT REFUSED. D9 is "a minimum length, and
    nothing else — no character classes, no dictionary check, no expiry, NO REUSE
    HISTORY", and "the new one must differ from the old" is a reuse-history rule
    one entry deep. It is also not a no-op: the row gets a fresh argon2 salt and
    the bump ends every session, which is a legitimate thing to want — it is
    "sign me out everywhere" without changing what you have to remember. Erred
    toward accepting, because the cost of being wrong that way is a user who
    logs in once more, and the cost the other way is a rule a settled decision
    forbids, refusing a person at a weighbridge for a reason no screen can
    explain.

    A WRONG CURRENT PASSWORD IS A PLAIN 400, with no timing equalisation and no
    disguise. /auth/login collapses its three refusals into one byte-identical
    answer because an unauthenticated caller must not learn whether a username
    exists. NOTHING IS LEARNED HERE: the caller already holds a valid token for
    this exact account, so "this account exists" and "this account is active" are
    facts they arrived with. What stops somebody with a borrowed unlocked handset
    is having to supply the old password, and how many times they may try is a
    WHOLE-SYSTEM gap recorded in OPEN_ITEMS.md — not something to invent at one
    route, where it would read as handled everywhere.

    THE NEW HASH IS COMPUTED BEFORE THE CONNECTION OPENS; the verify happens
    inside it. create_user's rule was "no argon2 inside the transaction FOR NO
    REASON" — here there is a reason for exactly one of the two: the verify needs
    the row, and doing it in the same transaction as the UPDATE means the hash
    that was checked is the hash that is being replaced. The other one has no such
    need and stays outside.
    """
    new_hash = await hash_password(body.new_password)

    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
        # NO hand-written `WHERE tenant_id` (hard rule 2), the doctrine this
        # module states three times: the RLS policy scopes the row, and the id
        # comes from the TOKEN rather than from the body, so there is no
        # predicate here to get wrong and no argument here to get wrong.
        current = (
            await conn.execute(
                text("SELECT password_hash FROM users WHERE id = :id"),
                {"id": principal.user_id},
            )
        ).scalar_one_or_none()
        # get_principal has already proven this row exists and is active THIS
        # request; a None here would mean it vanished mid-request, which is not a
        # client error and must not be dressed up as one.
        if current is None:  # pragma: no cover - see above
            raise _not_found("user")
        if not await verify_password(current, body.current_password):
            raise _bad_request(
                "current_password_incorrect",
                "the current password does not match this account",
            )

        row = (
            await conn.execute(
                text(
                    "UPDATE users"
                    " SET password_hash = :ph,"
                    " token_version = token_version + 1"
                    " WHERE id = :id"
                    " RETURNING id, username, token_version"
                ),
                {"ph": new_hash, "id": principal.user_id},
            )
        ).mappings().one()

    return _session_payload(row)


@router.post("/users/{user_id}/password")
async def reset_user_password(
    user_id: uuid.UUID,
    body: AdminPasswordReset,
    principal: Principal = Depends(require(Permission.USERS_MANAGE)),
) -> dict:
    """Set another user's password. users.manage ONLY.

    D6's route 2, and a SEPARATE ROUTE from the one above rather than a branch
    inside it. D6 argues that at length: the guard differs, the request body
    differs, and whose session dies differs, and a single handler deciding all
    three by inspecting the caller can be wrong in the permissive direction — a
    staff token that manages to supply a target user id would be one missing `if`
    away from setting a colleague's password, and the failure would answer 200.
    Two routes make that a refusal from the router.

    ADMIN, for the same reason every other route here is: this is authority over
    an account, the same class of thing as locking one or voiding a bill.

    THE TARGET'S SESSIONS DIE; THE CALLER'S DO NOT. That is the whole difference
    from the route above and it is what makes a reset usable — an owner resetting
    a dismissed employee's account must not be signed out of their own by doing
    it. One UPDATE, on one row, named in the path.

    NO CURRENT PASSWORD, and no attempt to invent one. An admin resetting an
    account does not know its password.

    NO hand-written `WHERE tenant_id`, deliberately (hard rule 2), and this is the
    route where that doctrine earns its keep: the RLS policy's USING clause
    already restricts the visible rows to the context tenant, so an admin of
    tenant A naming a user id in tenant B matches NOTHING, the UPDATE touches no
    row, and this answers 404. Not 403 — from inside this tenant that row does not
    exist, and answering "forbidden" would confirm that some other shop has a user
    with that id, which is what revoke_sessions gives as the reason for the same
    choice.

    WHETHER AN ADMIN MAY RESET THEIR OWN PASSWORD THROUGH THIS ROUTE IS NOT
    DECIDED, and no rule is invented here in either direction: D6 records it as
    open, under "whether an admin may set their OWN password through route 2 as
    well as route 3, which is a question about overlap and not about privilege".
    Nothing refuses it, so it works, and it behaves exactly as the route above
    would — the bump ends the caller's own sessions, because the caller is the
    target. That is a consequence of the rule already written, not a second one.

    NO ONE BUT THE OWNER SETS AN OWNER'S PASSWORD (ADVISOR-DECIDED 2026-10-17, 3a):
    403 `owner_password_owner_only` when the target holds the owner role and is
    not the caller -- admins included, a second owner included. Without it an
    admin resets the owner's password and signs in as the owner (red team on
    f3abf7b). The way back for an owner who forgot it is provider-side,
    scripts/reset_owner_password.py, run by us and audited. The target's role is
    read in THIS transaction, locked with the row the UPDATE will touch, so a role
    change cannot slip between the check and the write. Proven by
    prove_owner_password.py (O1/O2), whose named disproof is deleting this check.
    """
    new_hash = await hash_password(body.new_password)

    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
        target_role = (
            await conn.execute(
                text(
                    "SELECT r.code FROM users u JOIN roles r ON r.id = u.role_id"
                    " WHERE u.id = :id FOR NO KEY UPDATE OF u"
                ),
                {"id": user_id},
            )
        ).scalar_one_or_none()
        if target_role is None:
            raise _not_found("user")
        if target_role == OWNER_ROLE and user_id != principal.user_id:
            raise forbidden(
                "owner_password_owner_only",
                "รหัสผ่านของเจ้าของร้านเปลี่ยนได้โดยเจ้าของร้านเองเท่านั้น",
            )
        row = (
            await conn.execute(
                text(
                    "UPDATE users"
                    " SET password_hash = :ph,"
                    " token_version = token_version + 1"
                    " WHERE id = :id"
                    " RETURNING id, username, token_version"
                ),
                {"ph": new_hash, "id": user_id},
            )
        ).mappings().first()

    if row is None:
        raise _not_found("user")

    return _session_payload(row)
