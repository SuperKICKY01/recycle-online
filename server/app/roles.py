"""The role screen's routes (B6, 2026-10-13): which permissions each of a shop's roles holds, read
and edited as ticks. The screen permissions.py and STRUCTURE.md section 3 filed as OWED; it is what
`roles.manage` was minted for and the first route that gates on it.

  GET /roles                       users.manage   every role of this shop with its permission set,
                                                  and the catalogue (code + description)
  PUT /roles/{role_id}/permissions roles.manage   REPLACE one role's set, in one transaction

THE RULES, each a named refusal; the first four are held by server/scripts/prove_roles.py (R7, R8,
R11, R9), the fifth is NOT -- see it:
  - THE OWNER ROLE IS FIXED (409 owner_role_fixed). The owner holds the whole catalogue by
    definition (SYSTEM_ROLE_GRANTS); a shop that could narrow it could lock its own owner out of the
    one screen that would undo it.
  - `roles.manage` IS THE OWNER'S ALONE (422 roles_manage_owner_only). It is the one permission that
    separates the owner seat from the admin seat (permissions.py DESCRIPTIONS); ticking it onto
    another role would erase that separation through the very screen it guards.
  - `users.manage` IS NOT A TICK (422 users_manage_fixed): it stays exactly where the shop was born
    with it -- owner and admin hold it, staff does not -- and this screen can neither add it to a role
    nor take it away. RED TEAM 2026-10-13 on f3abf7b: ADDED to staff it lets every staff account reset
    the owner's password (POST /users/{id}/password carries no escalation guard) and sign in as the
    owner; REMOVED from admin concurrently with a deactivate it zeroes the set the last-active-admin
    lock protects (users.py's lock covers users rows only, its stated premise being that no route
    deletes a grant). Who may hold users.manage is the same decision as who may take an account over,
    and that is the owner's to make (OPEN_ITEMS.md), not a tick's.
  - EVERY CODE IS IN THE CATALOGUE (422 permission_unknown): the FK would refuse it anyway, as a 500.
  - THE ESCALATION GUARD, users.create_user's rule applied to an edit (403 role_exceeds_caller): a
    caller may grant only permissions they hold themselves. UNREACHABLE TODAY AND UNPROVEN: only the
    owner holds roles.manage and the owner holds every code, so `wanted - principal.permissions` is
    always empty; no cell can make it refuse. It is kept as the rule for the day a shop's own role
    carries roles.manage (which the rule above forbids), and nothing has observed it working.

EFFECT IS IMMEDIATE. get_principal reads role_permissions on every request and never the token's
claim (auth.py), so a removed tick refuses that role's very next request, and an added one admits
it; no session is revoked and none needs to be. A client refreshes its own copy through /whoami.

AUDITED: role_permissions carries the audit trigger (0019); every write here runs under the caller
as actor through tenant_connection, so the log names who changed which role. Rows are inserted and
deleted -- a grant is configuration, not a transaction (hard rule 5 does not apply), and the audit
row is the history.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text

from .auth import Principal, forbidden, require
from .db import tenant_connection
from .master import _TENANT, _invalid, _not_found
from .permissions import OWNER_ROLE, Permission

router = APIRouter()


def _refused(code: str, message: str) -> HTTPException:
    """409: the request is well-formed and the ROW refuses it (the shifts module's shape)."""
    return HTTPException(status.HTTP_409_CONFLICT, detail={"kind": "conflict", "code": code, "message": message})

_CATALOGUE = frozenset(p.value for p in Permission)


class RolePermissionsSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # The WHOLE set the role should hold afterwards. A set is one fact, so it is a PUT that
    # replaces it (the tier-order shape), never a sequence of per-tick writes that half-apply.
    permissions: list[str] = Field(max_length=64)


async def _roles(conn: Any) -> list[dict]:
    rows = (
        await conn.execute(
            text(
                "SELECT r.id, r.code, r.name, r.is_system, r.is_active,"
                " coalesce(array_agg(rp.permission ORDER BY rp.permission)"
                "          FILTER (WHERE rp.permission IS NOT NULL), '{}'::text[]) AS permissions"
                " FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id"
                " GROUP BY r.id, r.code, r.name, r.is_system, r.is_active"
                " ORDER BY r.is_system DESC, r.code"
            )
        )
    ).mappings().all()
    return [
        {"id": str(r["id"]), "code": r["code"], "name": r["name"], "is_system": r["is_system"],
         "is_active": r["is_active"], "permissions": list(r["permissions"])}
        for r in rows
    ]


@router.get("/roles")
async def list_roles(principal: Principal = Depends(require(Permission.USERS_MANAGE))) -> dict:
    """users.manage: the person who hands out accounts sees what each role can do. RLS scopes
    `roles` and `role_permissions` to the caller's shop; nothing here names a person."""
    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
        roles = await _roles(conn)
        catalogue = (await conn.execute(text("SELECT code, description FROM permissions ORDER BY code"))).mappings().all()
    return {"roles": roles, "catalogue": [{"code": c["code"], "description": c["description"]} for c in catalogue]}


@router.put("/roles/{role_id}/permissions")
async def set_role_permissions(
    role_id: uuid.UUID,
    body: RolePermissionsSet,
    principal: Principal = Depends(require(Permission.ROLES_MANAGE)),
) -> dict:
    wanted = set(body.permissions)
    unknown = sorted(wanted - _CATALOGUE)
    if unknown:
        raise _invalid("permission_unknown", "มีสิทธิ์ที่ไม่รู้จักในรายการ", field="permissions", unknown=unknown)
    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
        role = (
            await conn.execute(text("SELECT id, code FROM roles WHERE id = :id FOR UPDATE"), {"id": role_id})
        ).mappings().first()
        if role is None:
            raise _not_found("role")
        if role["code"] == OWNER_ROLE:
            raise _refused("owner_role_fixed", "สิทธิ์ของเจ้าของร้านแก้ไขไม่ได้ — เจ้าของร้านมีทุกสิทธิ์เสมอ")
        held_now = set((await conn.execute(text("SELECT permission FROM role_permissions WHERE role_id = :r"),
                                           {"r": role_id})).scalars().all())
        if (Permission.USERS_MANAGE.value in wanted) != (Permission.USERS_MANAGE.value in held_now):
            raise _invalid("users_manage_fixed",
                           "สิทธิ์จัดการบัญชีพนักงานเปลี่ยนจากหน้านี้ไม่ได้ — เป็นของเจ้าของร้านและผู้ดูแลเท่านั้น",
                           field="permissions")
        if Permission.ROLES_MANAGE.value in wanted:
            raise _invalid("roles_manage_owner_only", "สิทธิ์จัดการตำแหน่งเป็นของเจ้าของร้านเท่านั้น",
                           field="permissions")
        over_reach = sorted(wanted - principal.permissions)
        if over_reach:
            raise forbidden("role_exceeds_caller", "ไม่สามารถกำหนดสิทธิ์ที่สูงกว่าสิทธิ์ของตนเองได้",
                            role=role["code"], over_reach=over_reach)
        held = set((await conn.execute(text("SELECT permission FROM role_permissions WHERE role_id = :r"),
                                       {"r": role_id})).scalars().all())
        for code in sorted(held - wanted):
            await conn.execute(text("DELETE FROM role_permissions WHERE role_id = :r AND permission = :p"),
                               {"r": role_id, "p": code})
        for code in sorted(wanted - held):
            await conn.execute(
                text(f"INSERT INTO role_permissions (tenant_id, role_id, permission) VALUES ({_TENANT}, :r, :p)"),
                {"r": role_id, "p": code})
        out = next(r for r in await _roles(conn) if r["id"] == str(role_id))
    return out
