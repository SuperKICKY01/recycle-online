"""Shifts and the cash drawer: open, close, the frozen figure, and cash movements
(migration 0021's tables, their routes in the shifts unit's commit 2; migration
0022 mints shifts.manage and the freeze trigger). STRUCTURE.md 2.4 and 3.5.

Six routes, all under `shifts.manage`:
  POST /shifts                 open a shift on a branch with its opening float
  GET  /shifts/current         the branch's open shift (the running drawer figure
                               only for money.view_shop)
  POST /shifts/{id}/close      count the drawer; the server computes expected_cash,
                               freezes it with the count and the variance
  PATCH /shifts/{id}           add the reason for a difference, once, after close
  POST /cash-movements         a float in/out, an expense, a deposit to the bank
  GET  /cash-movements         the movements of one shift

ONLINE ONLY. No offline kind, no outbox, no late-arrival path is built here: a
payment or movement reaching the server after its shift closed is a policy recorded
at OPEN_ITEMS.md and built with the offline kinds.

A SWITCH IS NEVER READ ON A WRITE PATH'S ACCEPTANCE TEST (STRUCTURE.md invariant 1,
1.3). branches.shifts_enabled and the branch_payment_methods rows decide what a
counter SHOWS; nothing in this module reads either. A shift opens on a shifts-off
branch, and a cash movement records with or without a shift. The server refuses a
drawer write only on ROWS (an open shift already there, a closed shift, an unknown
branch) and on the caller's permission, never on a policy column.

THE FIGURE (expected_cash), computed by the server and frozen at close (hard rule 6
applied to a drawer):
    opening_float
  + sum(cash_movements.amount  WHERE kind = 'float_in')
  - sum(cash_movements.amount  WHERE kind IN ('float_out', 'expense', 'deposit_to_bank'))
  - sum(payments.amount        WHERE method = 'cash')
over LIVE rows (voided excluded) stamped with THIS shift's id. Decimal end to end;
reconcile.py recomputes it independently in SQL and imports nothing from here.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from .auth import Principal, require
from .bills import _open_shift_stamp, _resolve_bill_branch
from .db import constraint_name_of, tenant_connection
from .permissions import Permission

router = APIRouter()

logger = logging.getLogger("recycle.shifts")

CashKind = Literal["expense", "float_in", "float_out", "deposit_to_bank"]
# Migration 0022's shifts_freeze_closed raises THIS SQLSTATE and nothing else does,
# so a refusal is translated by what the database said, never by matching text.
_FROZEN_SQLSTATE = "RF001"


def _invalid(code: str, message: str, **context: Any) -> HTTPException:
    return HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"kind": "invalid_request", "code": code, "message": message, **context},
    )


def _conflict(code: str, message: str, **context: Any) -> HTTPException:
    """409: the request is well-formed and the ROW's state refuses it."""
    return HTTPException(
        status.HTTP_409_CONFLICT,
        detail={"kind": "conflict", "code": code, "message": message, **context},
    )


def _not_found(code: str, message: str) -> HTTPException:
    return HTTPException(
        status.HTTP_404_NOT_FOUND, detail={"kind": "not_found", "code": code, "message": message}
    )


def _sqlstate_of(exc: BaseException) -> str:
    """The SQLSTATE of a database error, or "" if unknown. Walked, not indexed, for
    the reason db.constraint_name_of gives: SQLAlchemy's asyncpg dialect copies the
    sqlstate onto its own wrapper and chains the driver's exception as __cause__,
    and a defaulted attribute read answers "" for every error -- which every caller
    must treat as "I do not know"."""
    orig = getattr(exc, "orig", None)
    for candidate in (orig, getattr(orig, "__cause__", None), exc):
        code = getattr(candidate, "sqlstate", None)
        if code:
            return str(code)
    return ""


def _money(v: Any) -> str:
    return str(Decimal(v).quantize(Decimal("0.01")))


# ---------------------------------------------------------------------------
# the one figure
# ---------------------------------------------------------------------------
async def _drawer_figure(conn: AsyncConnection, shift_id: uuid.UUID, opening_float: Any) -> dict:
    """expected_cash for a shift, from its stamped LIVE rows, with the parts it is
    made of. One function for the running figure and the frozen one, so the number
    a cashier watched and the number frozen at close cannot be two formulas."""
    mv = (
        await conn.execute(
            text(
                "SELECT"
                " coalesce(sum(amount) FILTER (WHERE kind = 'float_in'), 0) AS cash_in,"
                " coalesce(sum(amount) FILTER (WHERE kind IN"
                "   ('float_out', 'expense', 'deposit_to_bank')), 0) AS cash_out"
                " FROM cash_movements WHERE shift_id = :s AND voided_at IS NULL"
            ),
            {"s": shift_id},
        )
    ).mappings().one()
    paid = (
        await conn.execute(
            text(
                "SELECT coalesce(sum(amount), 0) FROM payments"
                " WHERE shift_id = :s AND method = 'cash' AND voided_at IS NULL"
            ),
            {"s": shift_id},
        )
    ).scalar_one()
    opening = Decimal(opening_float)
    cash_in, cash_out, paid = Decimal(mv["cash_in"]), Decimal(mv["cash_out"]), Decimal(paid)
    expected = (opening + cash_in - cash_out - paid).quantize(Decimal("0.01"))
    return {
        "opening_float": _money(opening),
        "cash_in": _money(cash_in),
        "cash_out": _money(cash_out),
        "cash_payments": _money(paid),
        "expected_cash": _money(expected),
        "_expected": expected,
    }


_SHIFT_COLUMNS = (
    "id, branch_id, opened_at, opened_by, opening_float, closed_at, closed_by,"
    " counted_cash, expected_cash, variance, variance_reason"
)


def _shift_payload(row: Any) -> dict:
    closed = row["closed_at"] is not None
    return {
        "id": str(row["id"]),
        "branch_id": str(row["branch_id"]),
        "status": "closed" if closed else "open",
        "opened_at": row["opened_at"].isoformat(),
        "opened_by": str(row["opened_by"]),
        "opening_float": _money(row["opening_float"]),
        "closed_at": row["closed_at"].isoformat() if closed else None,
        "closed_by": str(row["closed_by"]) if closed else None,
        "counted_cash": _money(row["counted_cash"]) if closed else None,
        "expected_cash": _money(row["expected_cash"]) if closed else None,
        "variance": _money(row["variance"]) if closed else None,
        "variance_reason": row["variance_reason"],
    }


async def _read_shift(conn: AsyncConnection, shift_id: uuid.UUID, *, lock: str = "") -> Any:
    return (
        await conn.execute(
            text(f"SELECT {_SHIFT_COLUMNS} FROM shifts WHERE id = :id {lock}"),
            {"id": shift_id},
        )
    ).mappings().first()


# ---------------------------------------------------------------------------
# shifts
# ---------------------------------------------------------------------------
class ShiftOpen(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Client-minted, and THE IDEMPOTENCY KEY: shifts has no idempotency_key column
    # (0021), and the brief's "one column" fence forbids adding one, so a replay of
    # the same id returns the same shift -- the bill's primary-key shape.
    id: uuid.UUID
    # The ledger's decimal STRING shape, scale declared at the edge so Postgres
    # never rounds it (lessons/edge-must-reject-what-the-column-rounds.md).
    opening_float: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    branch_id: uuid.UUID | None = None


@router.post("/shifts", status_code=status.HTTP_201_CREATED)
async def open_shift(
    body: ShiftOpen,
    response: Response,
    principal: Principal = Depends(require(Permission.SHIFTS_MANAGE)),
) -> dict:
    """Open a shift on the caller's branch (or the branch named).

    A SECOND OPEN SHIFT on the branch is 409 shift_already_open, enforced by the
    partial unique index uq_shifts_one_open_per_branch (0021) and translated here.
    There is deliberately NO pre-read of an open shift in front of the INSERT: a
    pre-read is a check two concurrent opens both pass, and it would also make the
    index's refusal unreachable -- the index is the rule, this route only words it.
    """
    try:
        async with tenant_connection(
            principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username
        ) as conn:
            existing = await _read_shift(conn, body.id)
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return _shift_payload(existing)
            branch = await _resolve_bill_branch(conn, principal, body.branch_id)
            await conn.execute(
                text(
                    "INSERT INTO shifts (id, tenant_id, branch_id, opened_at, opened_by,"
                    " opening_float) VALUES (:id, :t, :br, now(), :by, :f)"
                ),
                {"id": body.id, "t": principal.tenant_id, "br": branch.id,
                 "by": principal.user_id, "f": body.opening_float},
            )
            return _shift_payload(await _read_shift(conn, body.id))
    except IntegrityError as e:
        async with tenant_connection(principal.tenant_id) as conn:
            same = await _read_shift(conn, body.id)
            if same is not None:
                # The same open raced itself: one INSERT won, this is its replay.
                response.status_code = status.HTTP_200_OK
                return _shift_payload(same)
            if constraint_name_of(e) == "uq_shifts_one_open_per_branch":
                # Name the shift that holds the branch, so the counter can offer it.
                branch = await _resolve_bill_branch(conn, principal, body.branch_id)
                open_id = (
                    await conn.execute(
                        text("SELECT id FROM shifts WHERE branch_id = :br AND closed_at IS NULL"),
                        {"br": branch.id},
                    )
                ).scalar_one_or_none()
                raise _conflict(
                    "shift_already_open",
                    "สาขานี้มีกะที่เปิดอยู่แล้ว ต้องปิดกะเดิมก่อน",
                    open_shift_id=str(open_id) if open_id else None,
                ) from e
        logger.error("SHIFT_OPEN_FAILED tenant_id=%s shift_id=%s error=%s",
                     principal.tenant_id, body.id, type(e).__name__)
        raise


@router.get("/shifts/current")
async def current_shift(
    branch_id: uuid.UUID | None = Query(None),
    principal: Principal = Depends(require(Permission.SHIFTS_MANAGE)),
) -> dict:
    """The branch's open shift, or 404 no_open_shift. The RUNNING drawer figure is
    included ONLY for a principal holding money.view_shop -- money visibility
    already has its permission, and a shop grants it to a cashier role if it wants
    the cashier to see the drawer. Everyone else gets the shift without it."""
    async with tenant_connection(principal.tenant_id) as conn:
        branch = await _resolve_bill_branch(conn, principal, branch_id)
        row = (
            await conn.execute(
                text(f"SELECT {_SHIFT_COLUMNS} FROM shifts"
                     " WHERE branch_id = :br AND closed_at IS NULL"),
                {"br": branch.id},
            )
        ).mappings().first()
        if row is None:
            raise _not_found("no_open_shift", "ยังไม่มีกะที่เปิดอยู่ในสาขานี้")
        out = _shift_payload(row)
        if principal.has(Permission.MONEY_VIEW_SHOP):
            fig = await _drawer_figure(conn, row["id"], row["opening_float"])
            fig.pop("_expected")
            out["drawer"] = fig
        return out


class ShiftClose(BaseModel):
    model_config = ConfigDict(extra="forbid")
    counted_cash: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    variance_reason: str | None = Field(default=None, min_length=1, max_length=500)

    @field_validator("variance_reason")
    @classmethod
    def _not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("variance_reason must not be blank")
        return v


@router.post("/shifts/{shift_id}/close")
async def close_shift(
    shift_id: uuid.UUID,
    body: ShiftClose,
    principal: Principal = Depends(require(Permission.SHIFTS_MANAGE)),
) -> dict:
    """Close: lock the shift, compute expected_cash from its stamped live rows,
    and write the five close columns in ONE statement.

    THE LOCK IS TAKEN BEFORE THE SUM, and that order is the correctness of the
    figure. FOR NO KEY UPDATE conflicts with the FOR SHARE every recording path
    takes on this row (bills._open_shift_stamp), so a payment or movement that
    stamped this shift and has not committed is WAITED FOR, then summed; one that
    arrives after the lock is not stamped here at all. Summing first and locking
    at the UPDATE would freeze a figure missing a payment that committed in between.
    NO KEY, not FOR UPDATE: nothing here changes the key, and FOR UPDATE would add
    nothing the share lock does not already give (an FK-only writer that skipped the
    share lock would wait under FOR UPDATE and then commit onto the closed shift
    anyway -- the reconciler's frozen-figure arm is what would catch that).

    closed_at is clock_timestamp() read AFTER the lock, not the transaction's
    now(): every row this figure includes committed before the lock was granted, so
    each one's server_received_at is <= closed_at by ordering (reconcile.py checks
    the window).
    """
    async with tenant_connection(
        principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username
    ) as conn:
        row = await _read_shift(conn, shift_id, lock="FOR NO KEY UPDATE")
        if row is None:
            raise _not_found("shift_not_found", "ไม่พบกะนี้")
        # Under the lock, so two closes serialise and the second reads closed_at set.
        if row["closed_at"] is not None:
            raise _conflict("shift_closed", "กะนี้ปิดไปแล้ว", shift_id=str(shift_id))
        fig = await _drawer_figure(conn, shift_id, row["opening_float"])
        expected = fig.pop("_expected")
        variance = body.counted_cash - expected
        await conn.execute(
            text(
                "UPDATE shifts SET closed_at = clock_timestamp(), closed_by = :by,"
                " counted_cash = :c, expected_cash = :e, variance = :v,"
                " variance_reason = :r WHERE id = :id"
            ),
            {"by": principal.user_id, "c": body.counted_cash, "e": expected,
             "v": variance, "r": body.variance_reason, "id": shift_id},
        )
        out = _shift_payload(await _read_shift(conn, shift_id))
        out["drawer"] = fig
        return out


class ShiftReason(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variance_reason: str = Field(min_length=1, max_length=500)

    @field_validator("variance_reason")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("variance_reason must not be blank")
        return v


@router.patch("/shifts/{shift_id}")
async def set_variance_reason(
    shift_id: uuid.UUID,
    body: ShiftReason,
    principal: Principal = Depends(require(Permission.SHIFTS_MANAGE)),
) -> dict:
    """Write the reason for a difference, AFTER the close, ONCE.

    The count was frozen when it was submitted; the reason is written after the
    cashier has seen the difference. So the route only refuses an OPEN shift (a
    reason before the count exists is not a reason for anything). Whether the
    reason may be written at all is decided by the freeze trigger (0022) and
    NOTHING here pre-reads variance_reason: a second reason is refused BY THE
    DATABASE and translated to 409 shift_reason_frozen. A pre-check in front of the
    UPDATE would make the trigger's refusal unreachable from this route, and the
    trigger is the rule.
    """
    try:
        async with tenant_connection(
            principal.tenant_id, actor_id=principal.user_id, actor_username=principal.username
        ) as conn:
            row = await _read_shift(conn, shift_id, lock="FOR NO KEY UPDATE")
            if row is None:
                raise _not_found("shift_not_found", "ไม่พบกะนี้")
            if row["closed_at"] is None:
                raise _conflict("shift_open", "ยังไม่ได้ปิดกะ จึงยังระบุเหตุผลส่วนต่างไม่ได้",
                                shift_id=str(shift_id))
            await conn.execute(
                text("UPDATE shifts SET variance_reason = :r WHERE id = :id"),
                {"r": body.variance_reason, "id": shift_id},
            )
            return _shift_payload(await _read_shift(conn, shift_id))
    except DBAPIError as e:
        if _sqlstate_of(e) == _FROZEN_SQLSTATE:
            raise _conflict(
                "shift_reason_frozen", "ระบุเหตุผลของกะนี้ไปแล้ว แก้ไขไม่ได้",
                shift_id=str(shift_id),
            ) from e
        raise


# ---------------------------------------------------------------------------
# cash movements
# ---------------------------------------------------------------------------
class CashMovementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    kind: CashKind
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)
    idempotency_key: str = Field(min_length=1)
    device_created_at: datetime
    branch_id: uuid.UUID | None = None


_MOVEMENT_COLUMNS = (
    "id, branch_id, shift_id, kind, amount, note, created_by, device_created_at,"
    " server_received_at, idempotency_key, voided_at, voided_by, void_reason"
)


def _movement_payload(row: Any) -> dict:
    return {
        "id": str(row["id"]),
        "branch_id": str(row["branch_id"]),
        "shift_id": str(row["shift_id"]) if row["shift_id"] else None,
        "kind": row["kind"],
        "amount": _money(row["amount"]),
        "note": row["note"],
        "created_by": str(row["created_by"]),
        "device_created_at": row["device_created_at"].isoformat(),
        "server_received_at": row["server_received_at"].isoformat(),
        "idempotency_key": row["idempotency_key"],
        "status": "voided" if row["voided_at"] is not None else "active",
    }


async def _read_movement_by_key(conn: AsyncConnection, key: str) -> Any:
    return (
        await conn.execute(
            text(f"SELECT {_MOVEMENT_COLUMNS} FROM cash_movements WHERE idempotency_key = :k"),
            {"k": key},
        )
    ).mappings().first()


@router.post("/cash-movements", status_code=status.HTTP_201_CREATED)
async def create_cash_movement(
    body: CashMovementCreate,
    response: Response,
    principal: Principal = Depends(require(Permission.SHIFTS_MANAGE)),
) -> dict:
    """Record money moving in the drawer that is not a payment. Stamped with the
    branch's OPEN shift at this instant, or NULL -- never refused for a missing
    shift (a shifts-off shop has none). Idempotent per tenant on idempotency_key,
    the payments shape. Void is NOT built here (recorded as owed)."""
    try:
        async with tenant_connection(principal.tenant_id) as conn:
            existing = await _read_movement_by_key(conn, body.idempotency_key)
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return _movement_payload(existing)
            branch = await _resolve_bill_branch(conn, principal, body.branch_id)
            received_at = (await conn.execute(text("SELECT now()"))).scalar_one()
            shift_id = await _open_shift_stamp(conn, branch.id, received_at)
            await conn.execute(
                text(
                    "INSERT INTO cash_movements (id, tenant_id, branch_id, shift_id, kind,"
                    " amount, note, created_by, device_created_at, server_received_at,"
                    " idempotency_key)"
                    " VALUES (:id, :t, :br, :sh, :k, :amt, :n, :by, :dca, :sra, :key)"
                ),
                {"id": body.id, "t": principal.tenant_id, "br": branch.id, "sh": shift_id,
                 "k": body.kind, "amt": body.amount, "n": body.note, "by": principal.user_id,
                 "dca": body.device_created_at, "sra": received_at,
                 "key": body.idempotency_key},
            )
            return _movement_payload(await _read_movement_by_key(conn, body.idempotency_key))
    except IntegrityError:
        async with tenant_connection(principal.tenant_id) as conn:
            existing = await _read_movement_by_key(conn, body.idempotency_key)
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return _movement_payload(existing)
        raise


@router.get("/cash-movements")
async def list_cash_movements(
    shift_id: uuid.UUID = Query(...),
    principal: Principal = Depends(require(Permission.SHIFTS_MANAGE)),
) -> dict:
    """The movements stamped with one shift, oldest first, voided rows INCLUDED and
    marked (a drawer list that hid a voided row would misstate what moved)."""
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(f"SELECT {_MOVEMENT_COLUMNS} FROM cash_movements WHERE shift_id = :s"
                     " ORDER BY server_received_at, id"),
                {"s": shift_id},
            )
        ).mappings().all()
    return {"shift_id": str(shift_id), "movements": [_movement_payload(r) for r in rows]}
