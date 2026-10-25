"""Buyers (M2, SRS 1.5): who the shop sells to -- a per-shop master like sellers.

  GET  /buyers                     any principal (the sell flow picks a buyer), ?include_inactive
  POST /buyers                     buyers.write   code optional: absent, the server assigns C001, C002, ...
  PATCH /buyers/{id}               buyers.write   name / phone / address / tax_id / note (code never changes)
  POST /buyers/{id}/deactivate     buyers.write   retired, never deleted: last year's sale still names its buyer
  POST /buyers/{id}/activate       buyers.write

NO ID-CARD DATA (ADVISOR-DECIDED 2026-10-25): a buyer is a business the shop sells scrap to. `tax_id` is the
13-digit taxpayer number a tax invoice prints, optional; there is no id_number, no photo, no birth date. Every
write is audited (0029 attached the trigger), so the actor rides the connection.
"""
from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from .auth import Principal, get_principal, require
from .db import tenant_connection
from .permissions import Permission

router = APIRouter()

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
Text500 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
TaxId = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[0-9]{13}$")]
_COLS = "id, code, name, phone, address, tax_id, note, is_active, created_at"
_ASSIGNED = r"^C[0-9]+$"


class BuyerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID | None = None
    code: Code | None = None
    name: Name
    phone: Phone | None = None
    address: Text500 | None = None
    tax_id: TaxId | None = None
    note: Text500 | None = None


class BuyerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    phone: Phone | None = None
    address: Text500 | None = None
    tax_id: TaxId | None = None
    note: Text500 | None = None


_NULLABLE = frozenset({"phone", "address", "tax_id", "note"})


def _payload(r: Any) -> dict:
    return {"id": str(r["id"]), "code": r["code"], "name": r["name"], "phone": r["phone"], "address": r["address"],
            "tax_id": r["tax_id"], "note": r["note"], "is_active": r["is_active"], "created_at": r["created_at"].isoformat()}


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, {"kind": "not_found", "code": "buyer_not_found", "message": "ไม่พบผู้ซื้อนี้"})


async def _read(conn: Any, bid: uuid.UUID) -> dict | None:
    r = (await conn.execute(text(f"SELECT {_COLS} FROM buyers WHERE id = :id"), {"id": bid})).mappings().first()
    return _payload(r) if r else None


@router.get("/buyers")
async def list_buyers(include_inactive: bool = Query(False), principal: Principal = Depends(get_principal)) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (await conn.execute(text(f"SELECT {_COLS} FROM buyers"
                                        f"{'' if include_inactive else ' WHERE is_active'} ORDER BY code"))).mappings().all()
    return {"buyers": [_payload(r) for r in rows]}


@router.post("/buyers", status_code=status.HTTP_201_CREATED)
async def create_buyer(body: BuyerCreate, principal: Principal = Depends(require(Permission.BUYERS_WRITE))) -> dict:
    """A code typed by the shop is kept as typed; absent, the next C-number above every C-number this shop holds.
    A duplicate typed code is 409 duplicate_code. An assigned code that loses a race to a concurrent create is
    re-derived (the winner's commit moved the table it is derived from), at most five times."""
    for attempt in range(5):
        try:
            async with tenant_connection(principal.tenant_id, actor_id=principal.user_id,
                                         actor_username=principal.username) as conn:
                code = body.code
                if code is None:
                    top = (await conn.execute(text("SELECT max(substring(code from 2)::numeric) FROM buyers"
                                                   " WHERE code ~ :shape"), {"shape": _ASSIGNED})).scalar_one()
                    code = f"C{int(top or 0) + 1:03d}"
                bid = body.id or uuid.uuid4()
                await conn.execute(text(
                    "INSERT INTO buyers (id, tenant_id, code, name, phone, address, tax_id, note, created_by)"
                    " VALUES (:id, NULLIF(current_setting('app.tenant_id', true), '')::uuid, :code, :name, :phone, :addr,"
                    " :tax, :note, :by)"),
                    {"id": bid, "code": code, "name": body.name, "phone": body.phone, "addr": body.address,
                     "tax": body.tax_id, "note": body.note, "by": principal.user_id})
                return await _read(conn, bid)
        except IntegrityError:
            if body.code is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, {"kind": "conflict", "code": "duplicate_code",
                                                              "message": "รหัสผู้ซื้อนี้ถูกใช้แล้ว"}) from None
            if attempt == 4:
                raise
    raise RuntimeError("unreachable")


@router.patch("/buyers/{buyer_id}")
async def update_buyer(buyer_id: uuid.UUID, body: BuyerUpdate,
                       principal: Principal = Depends(require(Permission.BUYERS_WRITE))) -> dict:
    changes = body.model_dump(exclude_unset=True)
    if not changes or any(v is None for k, v in changes.items() if k not in _NULLABLE):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            {"kind": "invalid", "code": "no_change", "message": "ต้องระบุอย่างน้อยหนึ่งช่อง และชื่อต้องไม่ว่าง"})
    sets = ", ".join(f"{k} = :{k}" for k in sorted(changes))
    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
        r = await conn.execute(text(f"UPDATE buyers SET {sets} WHERE id = :id"), {**changes, "id": buyer_id})
        if r.rowcount != 1:
            raise _not_found()
        return await _read(conn, buyer_id)


async def _set_active(buyer_id: uuid.UUID, principal: Principal, on: bool) -> dict:
    async with tenant_connection(principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username) as conn:
        r = await conn.execute(text("UPDATE buyers SET is_active = :a WHERE id = :id"), {"a": on, "id": buyer_id})
        if r.rowcount != 1:
            raise _not_found()
        return await _read(conn, buyer_id)


@router.post("/buyers/{buyer_id}/deactivate")
async def deactivate_buyer(buyer_id: uuid.UUID, principal: Principal = Depends(require(Permission.BUYERS_WRITE))) -> dict:
    return await _set_active(buyer_id, principal, False)


@router.post("/buyers/{buyer_id}/activate")
async def activate_buyer(buyer_id: uuid.UUID, principal: Principal = Depends(require(Permission.BUYERS_WRITE))) -> dict:
    return await _set_active(buyer_id, principal, True)
