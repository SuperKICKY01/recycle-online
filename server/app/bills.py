"""Purchase bill endpoints (Phase 1c): atomic create, read, list, void.

A bill is submitted whole — header + all items in ONE request, inserted in ONE
transaction. All-or-nothing: there is never a header without its items.

Money is computed server-side with Decimal and stored as NUMERIC; client-sent
totals are only ever used to REJECT on mismatch, never trusted.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from .auth import Principal, get_principal, require_admin
from .config import SHOP_TIMEZONE
from .db import tenant_connection

router = APIRouter()

logger = logging.getLogger("recycle.bills")

# ---------------------------------------------------------------------------
# TWO SPECIES OF REJECTION
#
# A rejection means the server understood the bill and refused it. But refusals
# differ in one way that decides whether a real load survives:
#
#   PERMANENT (422)  — malformed input: a 4dp weight, a negative price, net that
#                      does not equal gross - tare. No action by anyone makes
#                      this payload valid. Retrying is pointless, so the bill is
#                      terminally `failed` and shown for correction.
#
#   RESOLVABLE (424) — the bill is well-formed and its references exist, but a
#                      piece of MASTER DATA it depends on has not been set up:
#                      no price tier for the seller's grade, or the seller has no
#                      grade at all. This BECOMES valid the moment the back office
#                      adds the price. Treating it as terminal would strand a load
#                      that has very likely already been tipped into the pile, and
#                      the yard would have to re-weigh scrap that no longer exists
#                      as a separate load.
#
# The distinction is carried by the STATUS CODE first, so it survives a body that
# fails to parse, and repeated in a machine-readable `code` for diagnostics. The
# client must never infer it by string-matching an error message.
#
# WHERE THE LINE SITS, deliberately: "the referenced row exists but is missing an
# attribute the back office routinely fills in" is resolvable. A reference that
# does not resolve at all (unknown seller_id/product_id) stays PERMANENT — the
# device got those ids from this tenant's own /sellers and /products, so a miss
# means a corrupt or stale reference, not a setup gap, and re-creating master data
# under an identical UUID is not a routine operation.
#
# THAT LINE WAS REVISITED IN 0004, exactly as the old note here said it should be
# if master data ever gained a delete. It gained a RETIREMENT instead, and a
# retired seller or product is firmly on the RESOLVABLE side:
#
#   - the row exists and resolves; only its is_active flag says otherwise;
#   - one admin click (POST .../activate) makes the SAME bill valid, unchanged;
#   - the device very likely holds a cached list from before the retirement, so
#     this is a stale-cache race, not a corrupt reference — the yard did nothing
#     wrong and the scrap is already on the pile.
#
# Calling it PERMANENT would fail a bill for a load that has been tipped, over a
# back-office click that happened while the truck was on the weighbridge.
# ---------------------------------------------------------------------------
_RESOLVABLE_STATUS = status.HTTP_424_FAILED_DEPENDENCY


def _master_data_missing(code: str, message: str, **context: str) -> HTTPException:
    """A refusal the OPERATOR can clear by setting up master data."""
    return HTTPException(
        status_code=_RESOLVABLE_STATUS,
        detail={
            "kind": "master_data_missing",
            "code": code,
            "message": message,
            **context,
        },
    )


def _log_poison_candidate(
    principal: "Principal", body: "BillCreate", exc: BaseException
) -> None:
    """Record a database error that is about to reach the client as a 500.

    DISTINCT AND GREPPABLE ON PURPOSE — grep the logs for BILL_POISON_CANDIDATE.

    A 500 is `unavailable` to the mobile client, never `rejected`, because the
    client genuinely cannot know whether the server committed
    (lessons/unavailable-is-not-rejected.md). Under strict head-of-line order
    that means the bill retries forever and dams every bill behind it on that
    device (lessons/queue-jam-must-be-visible.md). Phase-2 fixes narrow the known
    causes, but ANY future one has the same blast radius.

    The device raises its own alarm once such a bill has been refused N times in
    a row — but the device only knows THAT it failed, never WHY. This line is the
    server-side half of that pair: it names the exact tenant, bill and
    idempotency key, so a jammed yard can be diagnosed from the logs instead of
    guessed at. It does not change the response; the 500 is still honest.
    """
    logger.error(
        "BILL_POISON_CANDIDATE tenant_id=%s bill_id=%s idempotency_key=%s"
        " error=%s detail=%s",
        principal.tenant_id,
        body.id,
        body.idempotency_key,
        type(exc).__name__,
        str(getattr(exc, "orig", exc)).replace("\n", " ")[:500],
    )

_BE_OFFSET = 543  # Gregorian year + 543 = Buddhist-era year


def _be_year(when: datetime) -> int:
    """The Buddhist-era year of `when` AS THE SHOP RECKONS IT.

    Converted into the shop's timezone FIRST. Deriving this from the UTC date put
    the wrong year on a legal document for seven hours either side of new year: a
    bill received at 2027-01-01 00:30 in Bangkok is still 2026-12-31 in UTC, so it
    took be_year 2569 instead of 2570. Worse than a cosmetic slip, because
    doc_no_counters is keyed on (tenant_id, be_year) — the bill would also have
    continued the PREVIOUS year's sequence, so the new year's numbering would not
    start at 1 and two business years would share one counter.

    `when` must be timezone-aware, and WHICH INSTANT IS PASSED IS AS LOAD-BEARING
    AS THIS FUNCTION. Callers:

    * create_bill passes the row's OWN `server_received_at`, read once from the
      transaction's `now()` before anything is derived from it. It passed a
      separate `datetime.now(tz=utc)` until 2026-08-02, which is a different
      clock read at a different moment and could straddle new year — see the
      comment at the call site for what that costs.
    * reports._be_date_label passes a day's start instant.

    So a daily report's BE year, the doc_no year on the bills it lists, and the
    year keying doc_no_counters all come from ONE derivation applied to instants
    that are themselves the stored ones, and cannot disagree.
    """
    return when.astimezone(SHOP_TIMEZONE).year + _BE_OFFSET


def _line_amount(net_weight: Decimal, unit_price: Decimal) -> Decimal:
    return (net_weight * unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class BillItemIn(BaseModel):
    """The wire contract for one line.

    SCALE AND SIGN ARE DECLARED HERE, on the edge, because Postgres does NOT
    reject an out-of-scale value — it silently ROUNDS it to the column's scale.
    Verified against the live DB: `1.005` into NUMERIC(14,2) stores `1.01`, and
    gross `1.0005` / tare `0.0004` / net `1.0001` each round INDEPENDENTLY to
    `1.001` / `0.000` / `1.000`, after which `ck_items_net` (net = gross - tare)
    fails on three values that were exactly consistent in Python.

    That surfaced as an unhandled 500 — and a 500 is `unavailable` to the mobile
    client, never `rejected` (lessons/unavailable-is-not-rejected.md), so under
    strict head-of-line order the bill retries forever and dams every bill behind
    it on that device (lessons/queue-jam-must-be-visible.md). Rejecting at the
    edge converts a permanent silent jam into a terminal, visible 422.

    max_digits/decimal_places mirror the columns exactly: weights NUMERIC(14,3),
    money NUMERIC(14,2). ge=0 mirrors the CHECK constraints.
    """

    id: uuid.UUID
    product_id: uuid.UUID
    line_no: int = Field(gt=0)
    gross_weight: Decimal = Field(ge=0, max_digits=14, decimal_places=3)
    tare_weight: Decimal = Field(ge=0, max_digits=14, decimal_places=3)
    net_weight: Decimal = Field(ge=0, max_digits=14, decimal_places=3)
    unit_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    # list_price is deliberately NOT accepted from the client — the server stamps
    # it from product_prices at the seller's grade (see create_bill). Pydantic
    # ignores unknown keys, so a client still sending one is simply overridden.


class BillCreate(BaseModel):
    id: uuid.UUID
    seller_id: uuid.UUID
    vehicle_no: str | None = None
    device_created_at: datetime
    idempotency_key: str = Field(min_length=1)
    items: list[BillItemIn] = Field(min_length=1)
    # Optional client-computed total. If present it must equal the server total,
    # otherwise the request is rejected. It is never used as the stored value.
    total_amount: Decimal | None = Field(
        default=None, ge=0, max_digits=14, decimal_places=2
    )


class VoidRequest(BaseModel):
    reason: str = Field(min_length=1)


async def _read_bill(conn: AsyncConnection, bill_id) -> dict | None:
    h = (
        await conn.execute(
            text(
                "SELECT id, doc_no, seller_id, vehicle_no, idempotency_key, total_amount,"
                " device_created_at, server_received_at, created_by,"
                " voided_at, voided_by, void_reason"
                " FROM purchase_bills WHERE id = :id"
            ),
            {"id": bill_id},
        )
    ).mappings().first()
    if h is None:
        return None
    # THE PRODUCT JOIN HAS NO is_active PREDICATE, and must never gain one.
    # A bill is a receipt for money already paid; retiring a product stops it
    # being offered for NEW work and must not reach backwards and blank the code
    # and name on last year's slip. That failure has a precedent — proveCold C6
    # showed a priced line rendering with a blank code.
    #
    # LEFT JOIN, not INNER, purely for the failure mode. The composite FK
    # (tenant_id, product_id) makes a missing product impossible today, so the
    # two are equivalent — but if one ever went missing (a partial restore, say),
    # an INNER JOIN would silently DROP that line from the bill, and the header
    # total would then disagree with the lines with nothing to show why. A LEFT
    # JOIN keeps the money on the page and leaves the name null. Never lose a
    # money line to make a name resolve.
    items = (
        await conn.execute(
            text(
                "SELECT i.id, i.product_id, i.line_no, i.gross_weight, i.tare_weight,"
                " i.net_weight, i.unit_price, i.list_price, i.amount,"
                " p.code AS product_code, p.name AS product_name"
                " FROM purchase_bill_items i"
                " LEFT JOIN products p ON p.id = i.product_id"
                " WHERE i.bill_id = :id ORDER BY i.line_no"
            ),
            {"id": bill_id},
        )
    ).mappings().all()
    return {
        "id": str(h["id"]),
        "doc_no": h["doc_no"],
        "seller_id": str(h["seller_id"]),
        "vehicle_no": h["vehicle_no"],
        "idempotency_key": h["idempotency_key"],
        "total_amount": str(h["total_amount"]),
        "device_created_at": h["device_created_at"].isoformat(),
        "server_received_at": h["server_received_at"].isoformat(),
        # Who SYNCED the bill, not necessarily who weighed the load. The bound
        # is the column's own COMMENT (migration 0006), not this line.
        "created_by": str(h["created_by"]) if h["created_by"] else None,
        "status": "voided" if h["voided_at"] is not None else "active",
        "voided_at": h["voided_at"].isoformat() if h["voided_at"] else None,
        "voided_by": str(h["voided_by"]) if h["voided_by"] else None,
        "void_reason": h["void_reason"],
        "items": [
            {
                "id": str(i["id"]),
                "product_id": str(i["product_id"]),
                # Resolved regardless of whether the product has since been
                # retired — that is the point of the LEFT JOIN above.
                "product_code": i["product_code"],
                "product_name": i["product_name"],
                "line_no": i["line_no"],
                "gross_weight": str(i["gross_weight"]),
                "tare_weight": str(i["tare_weight"]),
                "net_weight": str(i["net_weight"]),
                "unit_price": str(i["unit_price"]),
                "list_price": str(i["list_price"]),
                "amount": str(i["amount"]),
            }
            for i in items
        ],
    }


@router.post("/bills", status_code=status.HTTP_201_CREATED)
async def create_bill(
    body: BillCreate,
    response: Response,
    principal: Principal = Depends(get_principal),
) -> dict:
    # ---- validate + compute money server-side (exact Decimal arithmetic) ----
    line_nos = [it.line_no for it in body.items]
    if len(set(line_nos)) != len(line_nos):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "duplicate line_no within bill")

    item_amounts: list[Decimal] = []
    for it in body.items:
        if it.net_weight != it.gross_weight - it.tare_weight:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"line {it.line_no}: net_weight must equal gross_weight - tare_weight",
            )
        item_amounts.append(_line_amount(it.net_weight, it.unit_price))
    server_total = sum(item_amounts, Decimal("0.00"))

    if body.total_amount is not None and body.total_amount != server_total:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"total mismatch: client sent {body.total_amount}, server computed {server_total}",
        )

    try:
        async with tenant_connection(principal.tenant_id) as conn:
            # Idempotency: the same key returns the SAME bill, never a duplicate.
            existing = (
                await conn.execute(
                    text("SELECT id FROM purchase_bills WHERE idempotency_key = :k"),
                    {"k": body.idempotency_key},
                )
            ).scalar_one_or_none()
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return await _read_bill(conn, existing)

            # References must exist IN THIS TENANT. RLS hides other tenants' rows,
            # so a foreign seller/product is simply "not found" here; the composite
            # (tenant_id, id) FKs are the hard structural backstop at insert time.
            #
            # The seller's GRADE is read here too, because it selects the price
            # tier (SRS 1.6) and the server — not the client — resolves list_price.
            seller = (
                await conn.execute(
                    text("SELECT grade, is_active FROM sellers WHERE id = :s"),
                    {"s": body.seller_id},
                )
            ).mappings().first()
            if seller is None:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "seller_id does not exist in this tenant",
                )
            if not seller["is_active"]:
                # Checked BEFORE the grade: if a retired seller also has no
                # grade, "this seller was retired" is the fact the office can
                # act on, and setting a grade on a retired seller would not
                # let the bill through anyway.
                raise _master_data_missing(
                    "seller_inactive",
                    "ผู้ขายรายนี้ถูกปิดใช้งานแล้ว",
                    seller_id=str(body.seller_id),
                )
            grade = seller["grade"]
            if grade is None:
                # RESOLVABLE: the back office sets the seller's grade and this
                # exact bill goes through, unchanged.
                raise _master_data_missing(
                    "seller_grade_unset",
                    "ผู้ขายรายนี้ยังไม่ได้กำหนดเกรด จึงยังไม่มีราคาตั้งต้น",
                    seller_id=str(body.seller_id),
                )

            # list_price is stamped from the tenant's OWN price list, at this
            # seller's grade, and the client's value (if any) is discarded.
            #
            # WHY THIS MATTERS. Storing unit_price AND list_price (hard rule 6)
            # exists so an audit can see that a yard paid something other than the
            # list. While the client supplied both, that comparison proved nothing:
            # a device paying an inflated unit_price could send a matching
            # list_price and the row would look perfectly ordinary. The reference
            # value has to come from the side that owns the price list.
            #
            # Fail CLOSED when there is no tier for this grade: a 422 is terminal
            # and visible, so it can never dam the send queue the way a 500 would.
            list_prices: list[Decimal] = []
            for it in body.items:
                row = (
                    await conn.execute(
                        text(
                            "SELECT p.is_active, pp.price FROM products p"
                            " LEFT JOIN product_prices pp"
                            "   ON pp.product_id = p.id AND pp.grade = :g"
                            " WHERE p.id = :p"
                        ),
                        {"p": it.product_id, "g": grade},
                    )
                ).mappings().first()
                if row is None:
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                        f"product_id {it.product_id} does not exist in this tenant",
                    )
                if not row["is_active"]:
                    # RESOLVABLE: reactivating the product lets this exact bill
                    # through. See the note at the top of this file.
                    raise _master_data_missing(
                        "product_inactive",
                        "สินค้านี้ถูกปิดใช้งานแล้ว",
                        product_id=str(it.product_id),
                    )
                if row["price"] is None:
                    # RESOLVABLE: adding this product's price for this grade makes
                    # the SAME bill valid. Never fabricate a price to get past it.
                    raise _master_data_missing(
                        "product_price_unset",
                        f"ยังไม่ได้ตั้งราคาสินค้าสำหรับเกรด {grade}",
                        product_id=str(it.product_id),
                        grade=grade,
                    )
                list_prices.append(row["price"])

            # THE ARRIVAL INSTANT IS READ FIRST, ONCE, AND EVERYTHING BELOW IS
            # DERIVED FROM IT. `now()` is TRANSACTION START in Postgres, so this
            # is a stable value, not a reading that moves as the transaction runs
            # — and it is the same value written to server_received_at below.
            #
            # THIS ORDERING IS THE WHOLE POINT. It used to be
            # `_be_year(datetime.now(tz=timezone.utc))`: a second clock, read at a
            # second moment, a full master-data round-trip after the transaction
            # began. A submit starting at 23:59:59.9 on 31 December shop time and
            # reaching this line after midnight took NEXT year's be_year while
            # server_received_at held LAST year's instant.
            #
            # Not a cosmetic mislabel: doc_no_counters is keyed on
            # (tenant_id, be_year), so such a bill OPENS THE WRONG COUNTER a year
            # early. The new year's real first bill then finds it at 1 and becomes
            # B-<year>-2, with no B-<year>-1 in existence — a permanent gap in a
            # legal document sequence that nothing can go back and repair. Proven
            # in both directions by scripts/prove_docno_clock.py, which lies to
            # Python's clock and shows this code is entirely unmoved by it.
            received_at = (await conn.execute(text("SELECT now()"))).scalar_one()
            be_year = _be_year(received_at)

            # Assign a GAP-FREE doc_no. The counter row is upserted then locked by
            # the UPDATE, in the SAME transaction as the insert: concurrent submits
            # serialize on the row lock (no collision) and a rolled-back submit
            # releases its increment (no gap). A native sequence could not do this.
            await conn.execute(
                text(
                    "INSERT INTO doc_no_counters (tenant_id, be_year, last_seq)"
                    " VALUES (:t, :y, 0) ON CONFLICT (tenant_id, be_year) DO NOTHING"
                ),
                {"t": principal.tenant_id, "y": be_year},
            )
            seq = (
                await conn.execute(
                    text(
                        "UPDATE doc_no_counters SET last_seq = last_seq + 1"
                        " WHERE tenant_id = :t AND be_year = :y RETURNING last_seq"
                    ),
                    {"t": principal.tenant_id, "y": be_year},
                )
            ).scalar_one()
            doc_no = f"B-{be_year}-{seq}"

            await conn.execute(
                text(
                    "INSERT INTO purchase_bills (id, tenant_id, seller_id, doc_no,"
                    " idempotency_key, total_amount, device_created_at,"
                    " server_received_at, vehicle_no, created_by)"
                    " VALUES (:id, :t, :s, :dn, :k, :tot, :dca, :sra, :vn, :cb)"
                ),
                {
                    "id": body.id, "t": principal.tenant_id, "s": body.seller_id,
                    "dn": doc_no, "k": body.idempotency_key, "tot": server_total,
                    "dca": body.device_created_at,
                    # EXPLICIT, not the column DEFAULT now(). The default would
                    # produce the same instant — it is the same transaction_timestamp
                    # — but "the same because both call now()" is a coupling a reader
                    # has to know to see. Passing the one value that be_year was
                    # derived from makes the agreement structural: there is no second
                    # read left in this path to drift. The DEFAULT stays on the column
                    # as a floor for any other writer.
                    "sra": received_at,
                    "vn": body.vehicle_no,
                    # THE SESSION THAT SUBMITTED THIS BILL, and never a field
                    # from the body. BillCreate carries no user of any kind and
                    # must not: a client-supplied author is an author the client
                    # chooses. principal.user_id has already been proven to name
                    # a live user IN THIS TENANT by get_principal, which re-reads
                    # the users row under tenant context — so the composite
                    # (tenant_id, created_by) FK cannot fail here. That matters
                    # on this path specifically: an unhandled 500 is
                    # `unavailable` to the client, so the bill would retry
                    # forever and dam every bill behind it on that device.
                    "cb": principal.user_id,
                },
            )
            for it, amt, lp in zip(body.items, item_amounts, list_prices):
                await conn.execute(
                    text(
                        "INSERT INTO purchase_bill_items (id, tenant_id, bill_id, product_id,"
                        " line_no, gross_weight, tare_weight, net_weight, unit_price,"
                        " list_price, amount)"
                        " VALUES (:id, :t, :b, :p, :ln, :gw, :tw, :nw, :up, :lp, :amt)"
                    ),
                    {
                        "id": it.id, "t": principal.tenant_id, "b": body.id,
                        "p": it.product_id, "ln": it.line_no,
                        "gw": it.gross_weight, "tw": it.tare_weight, "nw": it.net_weight,
                        "up": it.unit_price, "lp": lp, "amt": amt,
                    },
                )
            return await _read_bill(conn, body.id)
    except IntegrityError as e:
        # A concurrent submit of the SAME bill lost the race. ASK THE DATABASE
        # whether that is what happened; do not try to recognise it from the
        # constraint name.
        #
        # This used to read `if "idem" in constraint`, where `constraint` came
        # from `e.orig.constraint_name` — an attribute that DOES NOT EXIST on
        # what SQLAlchemy's asyncpg dialect puts in `.orig` (see
        # db.constraint_name_of). It was therefore always "", the branch never
        # ran once, and the loser of a race got a 500. A 500 is `unavailable` to
        # the client, so that bill retried forever and dammed every bill behind
        # it on that device — the exact head-of-line jam
        # lessons/queue-jam-must-be-visible.md is about, on the path hard rule 4
        # exists to protect.
        #
        # Even with the name read correctly, matching it would be fragile: the
        # bill's PRIMARY KEY is client-generated too, so a device retrying the
        # same bill collides on `purchase_bills_pkey` OR on
        # `uq_bills_tenant_idem` depending on which index Postgres checks first —
        # not something the handler can predict. The key resolving to a bill is
        # the fact that actually matters, and it is one SELECT away.
        async with tenant_connection(principal.tenant_id) as conn:
            existing = (
                await conn.execute(
                    text("SELECT id FROM purchase_bills WHERE idempotency_key = :k"),
                    {"k": body.idempotency_key},
                )
            ).scalar_one_or_none()
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return await _read_bill(conn, existing)
        # Not the idempotency race: this 500 is about to jam a device queue.
        _log_poison_candidate(principal, body, e)
        raise
    except SQLAlchemyError as e:
        # DataError (numeric overflow), CheckViolation, connection loss — anything
        # the DB layer raises that we did not anticipate. Same blast radius, so
        # the same distinct log line.
        _log_poison_candidate(principal, body, e)
        raise


@router.get("/bills")
async def list_bills(
    limit: int = Query(50, ge=1, le=200),
    principal: Principal = Depends(get_principal),
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT id, doc_no, seller_id, vehicle_no, total_amount,"
                    " device_created_at, server_received_at"
                    " FROM purchase_bills WHERE voided_at IS NULL"
                    " ORDER BY server_received_at DESC, id DESC LIMIT :lim"
                ),
                {"lim": limit},
            )
        ).mappings().all()
    return {
        "bills": [
            {
                "id": str(r["id"]),
                "doc_no": r["doc_no"],
                "seller_id": str(r["seller_id"]),
                "vehicle_no": r["vehicle_no"],
                "total_amount": str(r["total_amount"]),
                "device_created_at": r["device_created_at"].isoformat(),
                "server_received_at": r["server_received_at"].isoformat(),
            }
            for r in rows
        ]
    }


@router.get("/bills/{bill_id}")
async def get_bill(
    bill_id: uuid.UUID, principal: Principal = Depends(get_principal)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        bill = await _read_bill(conn, bill_id)
    if bill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "bill not found")
    return bill


@router.post("/bills/{bill_id}/void")
async def void_bill(
    bill_id: uuid.UUID,
    body: VoidRequest,
    # ADMIN ONLY. Voiding is the one destructive act the yard app can perform on
    # money already recorded — hard rule 5 means it is also the ONLY way to
    # correct a bill, so it cannot be locked away, but it must not be something
    # every phone on the floor can do to any bill. Creating bills stays open to
    # staff; unwinding one does not.
    principal: Principal = Depends(require_admin),
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        h = (
            await conn.execute(
                text("SELECT voided_at FROM purchase_bills WHERE id = :id"),
                {"id": bill_id},
            )
        ).mappings().first()
        if h is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "bill not found")
        if h["voided_at"] is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "bill already voided")
        # doc_no is left untouched -> a voided bill keeps its number, and the
        # counter is never decremented, so the number is never reused.
        await conn.execute(
            text(
                "UPDATE purchase_bills"
                " SET voided_at = now(), voided_by = :by, void_reason = :r"
                " WHERE id = :id"
            ),
            {"by": principal.user_id, "r": body.reason, "id": bill_id},
        )
        return await _read_bill(conn, bill_id)
