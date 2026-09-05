"""Payments: money leaving the shop, recorded at the counter (migration 0020,
STRUCTURE.md section 2, unit 3 of its section 12).

Two routes, both under `payments.record`: `POST /payments` records a payment
with its allocations to bills, idempotent per tenant on `idempotency_key`
exactly as a bill is; `GET /payments` lists the ledger newest first. No void
route in this unit (payments.void stays deferred with the counter screen).

WHO CALLS THIS TODAY: nobody. With `branches.separate_cashier` off -- every
shop that exists, and no route can turn it on -- `POST /bills` writes the
payment itself inside the bill's transaction (bills._record_automatic_payment)
and the counter never sees a ledger. These routes are the transition a shop
with a separated counter performs from a screen instead, and the screen is
the counter unit's. They exist now so the ledger can be read and written by
the real path the day it is needed, and so the proofs can flip the switch on a
scratch and watch a bill go unpaid, get paid, and stay paid.

TWO SPECIES OF REFUSAL, AND WHERE THE LINE SITS (lessons/unavailable-is-not-
rejected.md, the question the lesson asks: what would have to become true for
this to be valid, and is that a fact about the PAYLOAD or about the CLIENT?)

  424 RESOLVABLE  an allocation names a bill this tenant does not hold.
                  STRUCTURE.md 2.5 decides it: a counter records a payment for
                  a bill that is still in the SAME DEVICE'S queue, or in
                  another device's, and the bill arrives later. That is a fact
                  about the client's queue and it can become true. A 422 here
                  would be a terminal refusal of cash already handed over, on
                  the same phone whose bill lands a minute later. An inactive
                  seller is 424 too, the product doctrine bills.py records.

  422 PERMANENT   a voided bill (it never comes back), a seller mismatch (the
                  bill's seller is not this payment's), a bill already paid
                  beyond what this allocation asks (the ledger will not admit
                  it, P2), allocations summing past the payment's own amount
                  (P1), a duplicated bill in one payment. Each is a fact about
                  the payload against the ledger as it stands, and the repair
                  is a reissued payment with the right allocation -- which the
                  counter screen will do by reading paid_amount first. An
                  unknown seller is 422 by the seller doctrine: the device got
                  seller ids from this tenant's own list.

A PAYMENT IS ACCEPTED OR REFUSED AGAINST ROWS, NEVER AGAINST A SWITCH (invariant
1): nothing here reads separate_cashier. A shop whose counter is not separated
may still record a payment by hand -- an advance to a supplier going out to
collect, allocated to no bill -- and nothing refuses it.

MONEY IS DECIMAL END TO END: NUMERIC in the column, Decimal here, a STRING on the
wire. Scale is declared at the edge (max_digits/decimal_places) because Postgres
would ROUND an over-scale value rather than refuse it
(lessons/edge-must-reject-what-the-column-rounds.md).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from .auth import Principal, require
# The SAME three answers a bill gets (named branch, caller's branch, single
# active branch; unknown 422, inactive 424, unresolved 424) -- one resolver, so
# a payment can never land in a yard a bill could not. Imported by its private
# name on purpose rather than duplicated: two resolvers would be two answers.
from .bills import _master_data_missing, _resolve_bill_branch
from .db import tenant_connection
from .permissions import Permission

router = APIRouter()

logger = logging.getLogger("recycle.payments")

PaymentMethod = Literal["cash", "promptpay", "transfer", "write_off"]


def _invalid(code: str, message: str, **context: Any) -> HTTPException:
    """A PERMANENT refusal (422): no action by anyone makes this payload valid.
    Same kind/code envelope as master._invalid: one refusal vocabulary."""
    return HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"kind": "invalid_request", "code": code, "message": message, **context},
    )


def _bill_unknown(bill_id: uuid.UUID) -> HTTPException:
    """A RESOLVABLE refusal (424): the bill may still be in a device's queue.

    424 and NOT 422, and the docstring is where the reason lives (the owner's
    decision 4, 2026-09-05): an unknown bill is a fact about the caller's queue
    and may become true; a 422 would be terminal on the phone that is about to
    deliver that very bill, with the cash already handed over. The kind is its
    own -- a bill is not master data -- and the STATUS is the axis a client
    branches on, so a body that fails to parse still classifies right.
    """
    return HTTPException(
        status.HTTP_424_FAILED_DEPENDENCY,
        detail={
            "kind": "dependency_missing",
            "code": "bill_unknown",
            "message": "ยังไม่พบบิลที่ระบุในระบบ อาจยังส่งไม่ถึง",
            "bill_id": str(bill_id),
        },
    )


def _log_poison_candidate(principal: Principal, body: "PaymentCreate", exc: BaseException) -> None:
    """The payment twin of bills._log_poison_candidate: a 500 about to reach a
    client is `unavailable` there and retries for ever. Greppable on purpose."""
    logger.error(
        "PAYMENT_POISON_CANDIDATE tenant_id=%s payment_id=%s idempotency_key=%s"
        " error=%s detail=%s",
        principal.tenant_id, body.id, body.idempotency_key,
        type(exc).__name__, str(getattr(exc, "orig", exc)).replace("\n", " ")[:500],
    )


class AllocationIn(BaseModel):
    bill_id: uuid.UUID
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class PaymentCreate(BaseModel):
    # Client-minted, no default: a counter can be offline (hard rule 3's shape).
    id: uuid.UUID
    seller_id: uuid.UUID
    method: PaymentMethod
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    idempotency_key: str = Field(min_length=1)
    # A transfer reference or slip id the cashier reads off the banking app.
    reference: str | None = Field(default=None, max_length=200)
    device_created_at: datetime
    # Empty is legal: a payment allocated to no bill is an advance to the seller.
    allocations: list[AllocationIn] = Field(default_factory=list)
    # Optional on the wire for the reason bills.BillCreate gives: the server
    # resolves it from the caller, and a queued payload must never be refused
    # for a field its bundle did not know.
    branch_id: uuid.UUID | None = None


def _money(v: Any) -> str:
    return str(Decimal(v).quantize(Decimal("0.01")))


async def _read_payment(conn: AsyncConnection, payment_id: uuid.UUID) -> dict | None:
    h = (
        await conn.execute(
            text(
                "SELECT id, branch_id, seller_id, method, amount, idempotency_key,"
                " reference, device_created_at, server_received_at, paid_by,"
                " recorded_by_migration, voided_at, voided_by, void_reason"
                " FROM payments WHERE id = :id"
            ),
            {"id": payment_id},
        )
    ).mappings().first()
    if h is None:
        return None
    rows = (
        await conn.execute(
            text(
                "SELECT a.bill_id, a.amount, b.doc_no FROM payment_allocations a"
                " LEFT JOIN purchase_bills b ON b.id = a.bill_id"
                " WHERE a.payment_id = :id ORDER BY b.doc_no, a.bill_id"
            ),
            {"id": payment_id},
        )
    ).mappings().all()
    return _payment_payload(h, rows)


def _payment_payload(h: Any, allocations: list) -> dict:
    allocated = sum((a["amount"] for a in allocations), Decimal("0.00"))
    return {
        "id": str(h["id"]),
        "branch_id": str(h["branch_id"]),
        "seller_id": str(h["seller_id"]),
        "method": h["method"],
        "amount": _money(h["amount"]),
        "idempotency_key": h["idempotency_key"],
        "reference": h["reference"],
        "device_created_at": h["device_created_at"].isoformat(),
        "server_received_at": h["server_received_at"].isoformat(),
        # NULL only on a reconstruction whose bill predates created_by (0020).
        "paid_by": str(h["paid_by"]) if h["paid_by"] else None,
        "recorded_by_migration": bool(h["recorded_by_migration"]),
        "status": "voided" if h["voided_at"] is not None else "active",
        "voided_at": h["voided_at"].isoformat() if h["voided_at"] else None,
        "voided_by": str(h["voided_by"]) if h["voided_by"] else None,
        "void_reason": h["void_reason"],
        "allocations": [
            {"bill_id": str(a["bill_id"]), "doc_no": a["doc_no"], "amount": _money(a["amount"])}
            for a in allocations
        ],
        # Derived, never stored: what this payment settled and what it left as
        # an advance held by the seller.
        "allocated_amount": _money(allocated),
        "unallocated_amount": _money(Decimal(h["amount"]) - allocated),
    }


@router.post("/payments", status_code=status.HTTP_201_CREATED)
async def create_payment(
    body: PaymentCreate,
    response: Response,
    principal: Principal = Depends(require(Permission.PAYMENTS_RECORD)),
) -> dict:
    # ---- the payload against itself, before any row is read ----
    bill_ids = [a.bill_id for a in body.allocations]
    if len(set(bill_ids)) != len(bill_ids):
        raise _invalid("duplicate_allocation", "บิลเดียวกันถูกจัดสรรซ้ำในรายการจ่ายเดียว")
    allocated = sum((a.amount for a in body.allocations), Decimal("0.00"))
    if allocated > body.amount:
        # P1 at the edge: the allocations of a payment sum to at most its amount.
        raise _invalid(
            "allocations_exceed_amount",
            "ยอดที่จัดสรรให้บิลรวมกันเกินยอดจ่าย",
            amount=str(body.amount), allocated=str(allocated),
        )

    try:
        async with tenant_connection(principal.tenant_id) as conn:
            # Idempotency: the same key returns the SAME payment, never a
            # duplicate -- and the check precedes every write (hard rule 4).
            existing = (
                await conn.execute(
                    text("SELECT id FROM payments WHERE idempotency_key = :k"),
                    {"k": body.idempotency_key},
                )
            ).scalar_one_or_none()
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return await _read_payment(conn, existing)

            branch = await _resolve_bill_branch(conn, principal, body.branch_id)

            seller = (
                await conn.execute(
                    text("SELECT is_active FROM sellers WHERE id = :s"),
                    {"s": body.seller_id},
                )
            ).mappings().first()
            if seller is None:
                raise _invalid(
                    "seller_unknown", "ไม่พบผู้ขายรายนี้ในร้าน", seller_id=str(body.seller_id)
                )
            if not seller["is_active"]:
                raise _master_data_missing(
                    "seller_inactive", "ผู้ขายรายนี้ถูกปิดใช้งานแล้ว", seller_id=str(body.seller_id)
                )

            # ---- every allocation against the ledger, bill row LOCKED ----
            # FOR NO KEY UPDATE, not FOR UPDATE: it serialises two payments
            # allocating to one bill (so P2 cannot be broken by a race under
            # READ COMMITTED) while leaving FOR KEY SHARE alone, so a line
            # INSERT elsewhere is not stalled behind this counter
            # (lessons/a-lock-is-proven-by-what-waits-not-by-a-race.md).
            for a in body.allocations:
                bill = (
                    await conn.execute(
                        text(
                            "SELECT id, seller_id, total_amount, voided_at"
                            " FROM purchase_bills WHERE id = :b FOR NO KEY UPDATE"
                        ),
                        {"b": a.bill_id},
                    )
                ).mappings().first()
                if bill is None:
                    raise _bill_unknown(a.bill_id)
                if bill["voided_at"] is not None:
                    raise _invalid(
                        "bill_voided", "บิลนี้ถูกยกเลิกแล้ว จัดสรรเงินให้ไม่ได้",
                        bill_id=str(a.bill_id),
                    )
                if bill["seller_id"] != body.seller_id:
                    # P3 at the edge.
                    raise _invalid(
                        "seller_mismatch", "บิลนี้ไม่ใช่ของผู้ขายรายที่จ่ายเงินให้",
                        bill_id=str(a.bill_id), bill_seller_id=str(bill["seller_id"]),
                    )
                paid = Decimal(
                    (
                        await conn.execute(
                            text(
                                "SELECT coalesce(sum(x.amount), 0) FROM payment_allocations x"
                                " JOIN payments p ON p.id = x.payment_id"
                                " WHERE x.bill_id = :b AND p.voided_at IS NULL"
                            ),
                            {"b": a.bill_id},
                        )
                    ).scalar_one()
                )
                remaining = Decimal(bill["total_amount"]) - paid
                if a.amount > remaining:
                    # P2 at the edge: live allocations to a bill never exceed
                    # its total. The remaining figure is named so the counter
                    # can reissue with the right amount.
                    raise _invalid(
                        "allocation_exceeds_bill",
                        "ยอดที่จัดสรรเกินยอดคงค้างของบิล",
                        bill_id=str(a.bill_id), total_amount=str(bill["total_amount"]),
                        paid_amount=str(paid), remaining=str(remaining),
                        requested=str(a.amount),
                    )

            # The arrival instant, read once and used for every row below.
            received_at = (await conn.execute(text("SELECT now()"))).scalar_one()
            await conn.execute(
                text(
                    "INSERT INTO payments (id, tenant_id, branch_id, seller_id, method,"
                    " amount, idempotency_key, reference, device_created_at,"
                    " server_received_at, paid_by)"
                    " VALUES (:id, :t, :br, :s, :m, :amt, :k, :ref, :dca, :sra, :by)"
                ),
                {
                    "id": body.id, "t": principal.tenant_id, "br": branch.id,
                    "s": body.seller_id, "m": body.method, "amt": body.amount,
                    "k": body.idempotency_key, "ref": body.reference,
                    "dca": body.device_created_at, "sra": received_at,
                    # The session that recorded it, never a field from the body.
                    "by": principal.user_id,
                },
            )
            for a in body.allocations:
                await conn.execute(
                    text(
                        "INSERT INTO payment_allocations"
                        " (tenant_id, payment_id, bill_id, amount, created_at)"
                        " VALUES (:t, :p, :b, :amt, :at)"
                    ),
                    {
                        "t": principal.tenant_id, "p": body.id, "b": a.bill_id,
                        "amt": a.amount, "at": received_at,
                    },
                )
            return await _read_payment(conn, body.id)
    except IntegrityError as e:
        # A concurrent submit of the SAME payment lost the race: ask the database
        # (bills.py's own reasoning; the constraint name is not read).
        async with tenant_connection(principal.tenant_id) as conn:
            existing = (
                await conn.execute(
                    text("SELECT id FROM payments WHERE idempotency_key = :k"),
                    {"k": body.idempotency_key},
                )
            ).scalar_one_or_none()
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return await _read_payment(conn, existing)
        _log_poison_candidate(principal, body, e)
        raise
    except SQLAlchemyError as e:
        _log_poison_candidate(principal, body, e)
        raise


@router.get("/payments")
async def list_payments(
    limit: int = Query(50, ge=1, le=200),
    principal: Principal = Depends(require(Permission.PAYMENTS_RECORD)),
) -> dict:
    """The ledger, newest first, voided rows INCLUDED and marked -- a ledger that
    hid a voided payment would misstate what left the drawer."""
    async with tenant_connection(principal.tenant_id) as conn:
        heads = (
            await conn.execute(
                text(
                    "SELECT id, branch_id, seller_id, method, amount, idempotency_key,"
                    " reference, device_created_at, server_received_at, paid_by,"
                    " recorded_by_migration, voided_at, voided_by, void_reason"
                    " FROM payments ORDER BY server_received_at DESC, id DESC LIMIT :lim"
                ),
                {"lim": limit},
            )
        ).mappings().all()
        allocs = (
            await conn.execute(
                text(
                    "SELECT a.payment_id, a.bill_id, a.amount, b.doc_no"
                    " FROM payment_allocations a"
                    " LEFT JOIN purchase_bills b ON b.id = a.bill_id"
                    " WHERE a.payment_id IN ("
                    "   SELECT id FROM payments"
                    "   ORDER BY server_received_at DESC, id DESC LIMIT :lim)"
                    " ORDER BY b.doc_no, a.bill_id"
                ),
                {"lim": limit},
            )
        ).mappings().all()
    by_payment: dict[Any, list] = {}
    for a in allocs:
        by_payment.setdefault(a["payment_id"], []).append(a)
    return {
        "payments": [_payment_payload(h, by_payment.get(h["id"], [])) for h in heads]
    }
