"""The methods a branch accepts and the shop's own payment channels -- the settings
half of the shifts unit's commit 2 (migration 0021's branch_payment_methods and
shop_payment_channels; 0022 adds the born-with trigger and payments.channel_id).

  PUT   /branches/{id}/payment-methods/{method}   is_active, shop.settings.write AND the OWNER (R1)
  POST  /shop/payment-channels                    shop.settings.write
  PATCH /shop/payment-channels/{id}               label / is_active, shop.settings.write
  GET   /shop/payment-channels                    any principal, MASKED below

A DISPLAY RULE, NEVER AN ACCEPTANCE TEST (STRUCTURE.md invariant 1). The method rows
decide which buttons a counter SHOWS. POST /payments does not read them, so a method
deactivated here still records -- including cash, whose automatic payment in POST
/bills is untouched: a transfer-only counter is a real shop, and a bill already
weighed is paid whatever the counter shows. A deactivated CHANNEL is likewise
accepted on a payment (the money already moved).

CHANNEL MASKING -- decided 2026-09-26 by the advisor under the owner's delegation.
A promptpay_proxy may be the owner's own mobile or national id. The full identifier
(account_no, promptpay_proxy) leaves the server ONLY for a principal holding
shop.settings.write -- the people who can write the channel anyway. Everyone else
receives the label, kind, bank_code, account_name and the LAST FOUR characters of the
identifier, and nothing from which the full value could be rebuilt: no length, no
type-specific padding, and for an identifier of four characters or fewer NOT EVEN
the last four (those four would be the whole value). The masking is done HERE, in
serialisation; the full value is never placed in that principal's response to be
hidden by a client.
"""
from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text

from .auth import Principal, get_principal, require
from .branches import read_branch
from .db import tenant_connection
from .permissions import Permission
from .policy import MONEY_KEYS, require_owner

router = APIRouter()

Method = Literal["cash", "promptpay", "transfer", "write_off"]


def _invalid(code: str, message: str, **context: Any) -> HTTPException:
    return HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"kind": "invalid_request", "code": code, "message": message, **context},
    )


def _not_found(code: str, message: str) -> HTTPException:
    return HTTPException(
        status.HTTP_404_NOT_FOUND, detail={"kind": "not_found", "code": code, "message": message}
    )


# ---------------------------------------------------------------------------
# branch payment methods
# ---------------------------------------------------------------------------
class MethodUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_active: bool


@router.put("/branches/{branch_id}/payment-methods/{method}")
async def set_branch_method(
    branch_id: uuid.UUID,
    method: Method,
    body: MethodUpdate,
    principal: Principal = Depends(require(Permission.SHOP_SETTINGS_WRITE)),
) -> dict:
    """Turn a method on or off for a branch. A method outside the set is 422 at the
    path (the same set as payments.method and the table's CHECK). Upserted: a
    method a branch never had is created, one it had is toggled -- never deleted
    (no DELETE grant). Audited (0021), so the actor rides the connection.

    THE OWNER ONLY (ruling R1, 2026-10-25): how a seller may be paid is a payment setting in
    app/policy.py's catalogue, so an admin holding shop.settings.write is 403
    money_rule_owner_only and nothing is written. Branch existence is checked first, so a
    foreign branch is the same 404 for everyone."""
    async with tenant_connection(
        principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username
    ) as conn:
        if await read_branch(conn, branch_id) is None:
            raise _not_found("branch_not_found", "ไม่พบสาขานี้")
        await require_owner(conn, principal, set(MONEY_KEYS["branch_payment_methods"]))
        await conn.execute(
            text(
                "INSERT INTO branch_payment_methods (tenant_id, branch_id, method, is_active)"
                " VALUES (:t, :b, :m, :a)"
                " ON CONFLICT (tenant_id, branch_id, method)"
                " DO UPDATE SET is_active = EXCLUDED.is_active"
            ),
            {"t": principal.tenant_id, "b": branch_id, "m": method, "a": body.is_active},
        )
        row = (
            await conn.execute(
                text("SELECT method, is_active FROM branch_payment_methods"
                     " WHERE branch_id = :b AND method = :m"),
                {"b": branch_id, "m": method},
            )
        ).mappings().one()
        return {"branch_id": str(branch_id), "method": row["method"],
                "is_active": bool(row["is_active"])}


# ---------------------------------------------------------------------------
# shop payment channels
# ---------------------------------------------------------------------------
_CHANNEL_COLUMNS = (
    "id, branch_id, kind, label, promptpay_proxy, promptpay_proxy_type, bank_code,"
    " account_no, account_name, is_active, created_at"
)


def _last_four(value: str | None) -> str | None:
    """The last four characters, or None when the value is four or fewer long --
    then the 'last four' would be the whole identifier."""
    if value is None or len(value) <= 4:
        return None
    return value[-4:]


def _channel_payload(row: Any, *, full: bool) -> dict:
    """ONE serialiser, two shapes. `full` only for shop.settings.write; the masked
    shape carries NO key holding the full identifier (not even as null), so a
    client cannot be handed it by mistake."""
    identifier = row["promptpay_proxy"] if row["kind"] == "promptpay" else row["account_no"]
    out: dict = {
        "id": str(row["id"]),
        "branch_id": str(row["branch_id"]) if row["branch_id"] else None,
        "kind": row["kind"],
        "label": row["label"],
        "bank_code": row["bank_code"],
        "account_name": row["account_name"],
        "is_active": bool(row["is_active"]),
        "identifier_last4": _last_four(identifier),
    }
    if full:
        out.update({
            "promptpay_proxy": row["promptpay_proxy"],
            "promptpay_proxy_type": row["promptpay_proxy_type"],
            "account_no": row["account_no"],
            "created_at": row["created_at"].isoformat(),
        })
    return out


class ChannelCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["promptpay", "bank_account"]
    label: str = Field(min_length=1, max_length=100)
    branch_id: uuid.UUID | None = None
    promptpay_proxy: str | None = Field(default=None, min_length=1, max_length=64)
    promptpay_proxy_type: Literal["phone", "national_id", "ewallet"] | None = None
    bank_code: str | None = Field(default=None, min_length=1, max_length=16)
    account_no: str | None = Field(default=None, min_length=1, max_length=64)
    account_name: str | None = Field(default=None, min_length=1, max_length=200)


@router.post("/shop/payment-channels", status_code=status.HTTP_201_CREATED)
async def create_channel(
    body: ChannelCreate,
    principal: Principal = Depends(require(Permission.SHOP_SETTINGS_WRITE)),
) -> dict:
    """Add one of the shop's own accounts. Coherent for its kind or 422 -- the edge
    words the refusal; ck_shop_channels_coherent (0021) is the backstop."""
    if body.kind == "promptpay":
        ok = (body.promptpay_proxy is not None and body.promptpay_proxy_type is not None
              and body.bank_code is None and body.account_no is None and body.account_name is None)
    else:
        ok = (body.bank_code is not None and body.account_no is not None
              and body.account_name is not None
              and body.promptpay_proxy is None and body.promptpay_proxy_type is None)
    if not ok:
        raise _invalid(
            "channel_incoherent",
            "ข้อมูลช่องทางไม่ครบหรือไม่ตรงกับประเภท",
            kind=body.kind,
        )
    async with tenant_connection(
        principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username
    ) as conn:
        if body.branch_id is not None and await read_branch(conn, body.branch_id) is None:
            raise _not_found("branch_not_found", "ไม่พบสาขานี้")
        new_id = uuid.uuid4()
        await conn.execute(
            text(
                "INSERT INTO shop_payment_channels (id, tenant_id, branch_id, kind, label,"
                " promptpay_proxy, promptpay_proxy_type, bank_code, account_no,"
                " account_name, created_by)"
                " VALUES (:id, :t, :b, :k, :l, :pp, :ppt, :bc, :an, :am, :by)"
            ),
            {"id": new_id, "t": principal.tenant_id, "b": body.branch_id, "k": body.kind,
             "l": body.label, "pp": body.promptpay_proxy, "ppt": body.promptpay_proxy_type,
             "bc": body.bank_code, "an": body.account_no, "am": body.account_name,
             "by": principal.user_id},
        )
        row = (
            await conn.execute(
                text(f"SELECT {_CHANNEL_COLUMNS} FROM shop_payment_channels WHERE id = :id"),
                {"id": new_id},
            )
        ).mappings().one()
        return _channel_payload(row, full=True)


class ChannelUpdate(BaseModel):
    # extra="forbid": the IDENTIFYING fields (kind, proxy, bank, account) are
    # immutable -- a changed account is a NEW channel, so a payment that named the
    # old one still names the account the money actually left from.
    model_config = ConfigDict(extra="forbid")
    label: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None


@router.patch("/shop/payment-channels/{channel_id}")
async def update_channel(
    channel_id: uuid.UUID,
    body: ChannelUpdate,
    principal: Principal = Depends(require(Permission.SHOP_SETTINGS_WRITE)),
) -> dict:
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not changes or any(v is None for v in changes.values()):
        raise _invalid("no_change", "ต้องระบุชื่อหรือสถานะใช้งานอย่างน้อยหนึ่งอย่าง")
    assignments = ", ".join(f"{k} = :{k}" for k in sorted(changes))
    async with tenant_connection(
        principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username
    ) as conn:
        result = await conn.execute(
            text(f"UPDATE shop_payment_channels SET {assignments} WHERE id = :id"),
            {**changes, "id": channel_id},
        )
        if result.rowcount != 1:
            raise _not_found("channel_not_found", "ไม่พบช่องทางชำระเงินนี้")
        row = (
            await conn.execute(
                text(f"SELECT {_CHANNEL_COLUMNS} FROM shop_payment_channels WHERE id = :id"),
                {"id": channel_id},
            )
        ).mappings().one()
        return _channel_payload(row, full=True)


@router.get("/shop/payment-channels")
async def list_channels(principal: Principal = Depends(get_principal)) -> dict:
    """The shop's channels, inactive included and marked. ANY principal -- a cashier
    picks the account a transfer left from -- and MASKED unless the principal holds
    shop.settings.write (the module docstring holds the rule)."""
    full = principal.has(Permission.SHOP_SETTINGS_WRITE)
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(f"SELECT {_CHANNEL_COLUMNS} FROM shop_payment_channels"
                     " ORDER BY created_at, id")
            )
        ).mappings().all()
    return {"channels": [_channel_payload(r, full=full) for r in rows]}
