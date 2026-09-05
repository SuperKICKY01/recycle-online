"""The caller's branch -- the ONE read that POST /bills and GET /shop share.

A branch is a row inside the tenant (migration 0018, STRUCTURE.md section 9):
every tenant is born with one, every bill and every doc_no counter row carries
one by composite FK, and a user MAY be scoped to one (users.branch_id, NULL
meaning every branch). This module answers one question for both routes: given
the caller, which branch is theirs?

IT IS A READ, NEVER A GATE. Branch SCOPE -- may this user write in that branch
-- is enforced by nothing but the composite FK (a bill cannot name another
tenant's branch) until the permission model lands, and nothing here half-builds
that gate. A caller who names a branch in a bill gets that branch if it exists
and is active in their tenant; this module only says which branch to use when
they name none.

No WHERE tenant_id anywhere: every query runs inside tenant_connection, so RLS
scopes it, exactly as bills.py and master.py read sellers and tenants.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


@dataclass(frozen=True)
class Branch:
    id: uuid.UUID
    code: str
    name: str
    doc_prefix: str
    is_active: bool
    # The declared counter policy (migration 0020, STRUCTURE.md 1.2 and 1.6).
    # READ by POST /bills to decide WHO writes the payment -- the server, inside
    # the bill's transaction, when this is false; the cashier, later, when it is
    # true. Never an acceptance test (invariant 1). NOT on the wire: branch_payload
    # below keeps the five identity keys, because no phone screen reads a policy
    # in this unit and the policy cache of section 1.4 is a later unit's.
    separate_cashier: bool


@dataclass(frozen=True)
class CallerBranch:
    """What GET /shop reports and what POST /bills falls back to.

    `branch` is None when it CANNOT be resolved from the caller alone: the user
    is unscoped and the tenant has zero or more than one active branch. That is
    a real state, not an error -- a single-yard shop never lands here, and a
    multi-yard shop's owner is told the branch count so a client can offer the
    choice. `active_count` is the derived switch (STRUCTURE.md 1.1): a shop with
    one active branch shows no branch control.
    """

    branch: Branch | None
    active_count: int
    user_scoped: bool


def _row_to_branch(row) -> Branch:
    return Branch(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        doc_prefix=row["doc_prefix"],
        is_active=bool(row["is_active"]),
        separate_cashier=bool(row["separate_cashier"]),
    )


async def read_branch(conn: AsyncConnection, branch_id: uuid.UUID) -> Branch | None:
    """One branch by id, under the caller's tenant context; None if it is not
    this tenant's (RLS hides it) or does not exist -- the two are one answer
    here, as they are for a seller in bills.py."""
    row = (
        await conn.execute(
            text(
                "SELECT id, code, name, doc_prefix, is_active, separate_cashier"
                " FROM branches WHERE id = :b"
            ),
            {"b": branch_id},
        )
    ).mappings().first()
    return None if row is None else _row_to_branch(row)


async def read_caller_branch(conn: AsyncConnection, user_id: uuid.UUID) -> CallerBranch:
    """The caller's own branch: users.branch_id if set, else the tenant's single
    active branch, else None with the count.

    The scoped branch is returned EVEN IF DEACTIVATED, so the caller (POST /bills)
    can refuse with the resolvable code that names the cause; GET /shop reports
    it as it is.
    """
    active_count = int(
        (
            await conn.execute(text("SELECT count(*) FROM branches WHERE is_active"))
        ).scalar_one()
    )
    scoped = (
        await conn.execute(
            text("SELECT branch_id FROM users WHERE id = :u"), {"u": user_id}
        )
    ).scalar_one_or_none()
    if scoped is not None:
        return CallerBranch(
            branch=await read_branch(conn, scoped),
            active_count=active_count,
            user_scoped=True,
        )
    if active_count == 1:
        row = (
            await conn.execute(
                text(
                    "SELECT id, code, name, doc_prefix, is_active, separate_cashier"
                    " FROM branches WHERE is_active"
                )
            )
        ).mappings().one()
        return CallerBranch(branch=_row_to_branch(row), active_count=1, user_scoped=False)
    return CallerBranch(branch=None, active_count=active_count, user_scoped=False)


def branch_payload(b: Branch | None) -> dict | None:
    """The wire shape, shared by GET /shop and the bill read-back.

    separate_cashier is DELIBERATELY NOT here (0020): the five keys are the
    yard's identity, and prove_shop_settings.py E1 asserts exactly that set. A
    policy reaches the phone through section 1.4's cached_shop_policy, which is
    the counter unit's, not this one's.
    """
    if b is None:
        return None
    return {
        "id": str(b.id),
        "code": b.code,
        "name": b.name,
        "doc_prefix": b.doc_prefix,
        "is_active": b.is_active,
    }
