"""Master data: reads for any signed-in user, writes for admins — with ONE
named exception, POST /sellers.

    GET   /uoms                          POST  /uoms
    GET   /product-categories            POST  /product-categories
    GET   /products                      POST  /products
    GET   /sellers                       POST  /sellers   <- STAFF TOO (D1)
                                         PATCH /uoms/{id}
                                         PATCH /product-categories/{id}
                                         PATCH /products/{id}
                                         PATCH /sellers/{id}
                                         PUT   /products/{id}/prices/{grade}

Reads are open to staff: the yard app caches this list to price a bill offline,
so a phone that cannot read master data cannot work at all.

**Superseded 2026-08-17 (ROADMAP D1).** This said "Writes are behind
require_admin, every one of them". That is now FALSE of exactly one route and
still true of every other: `POST /sellers` takes `get_principal`, so STAFF may
create a seller. Nothing else moved, and STAFF DID NOT BECOME ADMINS — the
reason the gate was narrowed rather than opened is at create_seller, and the
control that proves it is prove_seller_create.py cells 4 and 5.

The intent behind the old sentence is unchanged and is the thing to preserve: a
yard phone must not be able to re-price the shop's product list from the
weighbridge. Every price and product write, `PATCH /sellers/{id}`, and both
seller activate/deactivate routes keep require_admin.

THERE IS NO DELETE ON THIS ROUTER, ANYWHERE, ON PURPOSE
-------------------------------------------------------
Old bills reference these rows through composite (tenant_id, id) foreign keys,
and proveCold C6 already showed what removing a referenced product does to
history: a priced line rendering with a blank code, on a bill that is legally a
receipt. The retirement path is `is_active = false` (migration 0004).

RETIREMENT HAS EXACTLY TWO HALVES, AND BOTH ARE LOAD-BEARING:

  - the LIST endpoints stop offering the row. That is what an operator means by
    "remove it" — it leaves the picker, so no new bill can be written against
    it. `?include_inactive=true` is how the back office finds it again, because
    a row that cannot be listed cannot be reactivated either.

  - every row-level read still RESOLVES it, with no is_active predicate
    anywhere. _read_seller/_read_product answer for inactive rows, and so does
    the product join in bills._read_bill. A receipt from last year must still
    print its product's code and name. Retirement is about the FUTURE only; it
    must never reach backwards into money already recorded.

Deactivating is therefore not a soft delete and must not be implemented like
one. The row keeps its id, code, name and price tiers, and keeps answering.

TENANT SCOPING — THERE IS NOT ONE HAND-WRITTEN `WHERE tenant_id` IN THIS FILE
-----------------------------------------------------------------------------
Every handler opens its connection through tenant_connection(principal.tenant_id),
which issues SET LOCAL app.tenant_id inside the request transaction from the
TOKEN's tenant. RLS then does the rest, and it does it for WRITES as well as
reads, in three separate ways:

  - SELECT/UPDATE see only this tenant's rows (the policy's USING clause), so
    another tenant's id is not "forbidden", it is INVISIBLE -> a plain 404.
  - INSERT is checked against the policy's WITH CHECK clause, so a row cannot be
    written into another tenant even if a handler tried.
  - the tenant_id an INSERT writes is _TENANT below — read back out of the SAME
    GUC the policy reads, so no handler passes a tenant_id at all and none can
    pass the wrong one.

Money is returned as STRINGS. Serialising NUMERIC through a JSON float is
precisely the drift this project forbids.
"""
from __future__ import annotations

import secrets
import uuid
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from .auth import ADMIN_ROLE, Principal, get_principal, require_admin
from .config import SHOP_TIMEZONE
from .db import constraint_name_of, tenant_connection

router = APIRouter()

# The tenant_id every INSERT here writes. Deliberately an expression, not a bind
# parameter: it comes out of the same GUC the RLS policy's WITH CHECK reads, so
# the value written and the value tested are one thing. With no context set it
# is NULL, which the NOT NULL column refuses — fail closed, never all-tenants.
_TENANT = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"


# ---------------------------------------------------------------------------
# Field types. Constrained HERE, at the edge, because the database's own limits
# are not all refusals: NUMERIC silently ROUNDS an over-scale price instead of
# rejecting it (lessons/edge-must-reject-what-the-column-rounds.md), and a CHECK
# violation arrives as a 500, which the mobile client reads as `unavailable` and
# retries forever. A constraint declared here is a terminal, visible 422.
# ---------------------------------------------------------------------------
# NAMED because the seller-code assigner below has to know it: a code the server
# mints must be one this same edge type would have accepted, and two copies of 64
# would drift the day one of them moved.
_CODE_MAX_LENGTH = 64
Code = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=_CODE_MAX_LENGTH),
]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
# A GRADE IS NOW A PER-TENANT TIER CODE, not a fixed letter (S16 / P1.24, migration
# 0015). The old `Grade = Literal["A","B","C","D"]` was a COMPILE-TIME set, and a
# set a shop chooses at run time cannot be one -- so it is gone, and with it the
# three A-D CHECKs it mirrored (0015 replaced them with composite FKs into
# grade_tiers). The edge now bounds only the SHAPE (a non-empty code within the
# column's length); the HANDLER validates the VALUE against this shop's grade_tiers
# (an active tier for a seller or a default; an existing tier for a price), which
# turns a foreign code into a READABLE 422 rather than the FK's IntegrityError 500.
# Bounds match the grade_tiers column CHECKs: code 1..32, name 1..100.
GradeCode = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)
]
GradeName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
# Mirrors product_prices.price: NUMERIC(14,2), CHECK (price >= 0).
Price = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]


# ---------------------------------------------------------------------------
# Refusals. Each one NAMES its kind, so no client ever string-matches a message.
# The kinds in play across the whole API, all mutually exclusive:
#   403 "forbidden"          — wrong role                        (auth.py)
#   404 "not_found"          — no such row IN YOUR TENANT        (here)
#   409 "conflict"           — that code is taken                (here)
#   422 "invalid_request"    — the payload can never be valid    (here)
#   424 "master_data_missing"— valid, but setup is incomplete    (bills.py)
# ---------------------------------------------------------------------------
def _not_found(entity: str) -> HTTPException:
    """No such row under THIS tenant.

    Note what this deliberately does not distinguish: a row that does not exist
    at all, and a row that exists in another tenant. RLS makes both invisible and
    the response makes both a 404 — so the API cannot be used to probe whether
    some id exists in a shop you do not belong to.
    """
    return HTTPException(
        status.HTTP_404_NOT_FOUND,
        detail={
            "kind": "not_found",
            "code": f"{entity}_not_found",
            "message": "ไม่พบข้อมูลนี้ในร้านของคุณ",
            "entity": entity,
        },
    )


def _conflict(entity: str, code_value: str) -> HTTPException:
    return HTTPException(
        status.HTTP_409_CONFLICT,
        detail={
            "kind": "conflict",
            "code": "duplicate_code",
            "message": f"รหัสนี้ถูกใช้ไปแล้ว: {code_value}",
            "entity": entity,
            "conflicting_code": code_value,
        },
    )


def _code_reserved(code_value: str) -> HTTPException:
    """A SUPPLIED seller code that a handset is holding offline.

    A CODE OF ITS OWN, and never `duplicate_code`. The two are different facts
    and a client that cannot tell them apart cannot act on either: a duplicate
    means the code is ALREADY ON A SELLER and the shop must pick another
    permanently; this means the code is spoken for by a device that has not come
    back yet, and the row it will become does not exist. Reusing
    `duplicate_code` here would also be a lie about `sellers`, where the code is
    provably absent at the moment of the refusal.

    IT NAMES THE CODE AND NOTHING ELSE FROM THE REQUEST. A create on this route
    carries a seller's name, and where the shop asks for them an ID CARD NUMBER
    and a home ADDRESS; a refusal that echoed its input would put those in a
    response body, which is the defect main.py's validation handler exists to
    close for pydantic's errors (lessons/a-refusal-hands-back-what-it-refused.md).
    The code is the one field the caller needs back to know which value was
    refused, and it is the field they typed.

    IT DOES NOT SAY WHOSE. Which device holds the reservation is not the
    caller's business and naming it would be a fact about another handset
    obtained by guessing a code. It also could not be said honestly: the holder
    may be the caller's own device, which simply failed to send its token.
    """
    return HTTPException(
        status.HTTP_409_CONFLICT,
        detail={
            "kind": "conflict",
            "code": "code_reserved",
            "message": f"รหัสนี้ถูกจองไว้แล้ว กรุณาใช้รหัสอื่น: {code_value}",
            "entity": "seller",
            "conflicting_code": code_value,
        },
    )


def _invalid(code: str, message: str, **context: Any) -> HTTPException:
    return HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"kind": "invalid_request", "code": code, "message": message, **context},
    )


# The per-tenant unique code constraints from migration 0001. A duplicate code
# would otherwise surface as an IntegrityError -> unhandled 500, and a 500 is
# `unavailable` to a client, not `rejected`. Naming them turns it into a 409 the
# back office can actually act on.
_DUPLICATE_CODE_CONSTRAINTS = {
    "uq_uoms_tenant_code": "uom",
    "uq_pcat_tenant_code": "product_category",
    "uq_products_tenant_code": "product",
    "uq_sellers_tenant_code": "seller",
    "uq_grade_tiers_tenant_code": "grade_tier",
}


def _raise_for_integrity(exc: IntegrityError, code_value: str) -> None:
    """Translate a KNOWN unique violation into a 409; re-raise anything else.

    Anything not in the table above is a genuine surprise and must keep its 500
    rather than be dressed up as a client error we understood. That includes an
    UNKNOWN name: products carry two unique constraints, and reporting "duplicate
    code" for a collision on (tenant_id, id) would be a confident lie.
    """
    constraint = constraint_name_of(exc)
    entity = _DUPLICATE_CODE_CONSTRAINTS.get(constraint)
    if entity is not None:
        raise _conflict(entity, code_value) from exc
    raise exc


# ---------------------------------------------------------------------------
# Partial update
# ---------------------------------------------------------------------------
def _changes(body: BaseModel, nullable: frozenset[str]) -> dict[str, Any]:
    """The columns the caller actually asked to change.

    Omitted -> absent, so it keeps its current value. Explicit null -> CLEAR the
    column, but only where the column is nullable; on a NOT NULL column that is a
    refusal, not a silent no-op, because silently ignoring it would report
    success for a change that did not happen.

    An empty body is refused too. Without this it would build `SET  WHERE ...`,
    a syntax error, i.e. a 500 for what is plainly a client mistake.
    """
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        if value is None and key not in nullable:
            raise _invalid(
                "field_not_nullable",
                f"ฟิลด์ {key} ต้องมีค่า",
                field=key,
            )
    if not data:
        raise _invalid("no_changes", "ไม่มีฟิลด์ที่จะแก้ไข")
    return data


# ---------------------------------------------------------------------------
# Retirement
# ---------------------------------------------------------------------------
def _active_filter(include_inactive: bool, column: str = "is_active") -> str:
    """The WHERE clause for a LIST endpoint. Row-level reads never use this."""
    return "" if include_inactive else f" WHERE {column}"


IncludeInactive = Annotated[
    bool,
    Query(
        description=(
            "Include retired rows. Default false: the yard app must never be"
            " offered a retired product. The back office needs true to find one"
            " again — a row it cannot list is a row it cannot reactivate."
        )
    ),
]


async def _set_active(
    conn: AsyncConnection, table: str, entity: str, row_id: uuid.UUID, active: bool
) -> None:
    """Flip is_active, or 404 if the row is not in this tenant.

    Deliberately idempotent: deactivating an already-retired row succeeds. The
    caller asked for a STATE, not for a transition, and answering 409 would make
    a retried request from a flaky connection look like a failure.
    """
    if not await _update_row(conn, table, row_id, {"is_active": active}):
        raise _not_found(entity)


async def _update_row(
    conn: AsyncConnection, table: str, row_id: uuid.UUID, changes: dict[str, Any]
) -> bool:
    """UPDATE <table> SET <changes> WHERE id = :id. True if a row was touched.

    `table` and the KEYS of `changes` are literals from this module's own models
    — never caller-supplied strings. The update models set extra="forbid", so
    model_dump cannot produce a key outside the declared set.

    There is no tenant predicate and there must not be one: the RLS policy's
    USING clause already restricts the visible rows to the context tenant, so
    another tenant's id matches nothing and rowcount comes back 0.
    """
    assignments = ", ".join(f"{col} = :{col}" for col in changes)
    result = await conn.execute(
        text(f"UPDATE {table} SET {assignments} WHERE id = :__row_id"),
        {**changes, "__row_id": row_id},
    )
    return result.rowcount > 0


# ---------------------------------------------------------------------------
# Grade validation against the shop's own tiers (S16 / P1.24). A grade is a tier
# CODE now, not a fixed letter; these are the readable 422s that stand in front
# of the composite FK's IntegrityError 500 for a code this shop has not declared.
# ---------------------------------------------------------------------------
async def _validate_grade(
    conn: AsyncConnection, grade: str, *, must_be_active: bool
) -> None:
    """422 unless `grade` is one of THIS shop's tiers. `must_be_active` also
    refuses a deactivated tier: a price may be set against any existing tier, but
    a seller cannot be seated in, nor a shop defaulted to, a retired one. No
    tenant predicate -- RLS scopes grade_tiers to the caller's shop, so a tier
    from another shop is simply not found here.
    """
    row = (
        await conn.execute(
            text("SELECT is_active FROM grade_tiers WHERE code = :c"), {"c": grade}
        )
    ).mappings().first()
    if row is None:
        raise _invalid(
            "grade_not_a_tier",
            f"เกรด {grade} ไม่ใช่เกรดของร้านนี้",
            grade=grade,
        )
    if must_be_active and not row["is_active"]:
        raise _invalid(
            "grade_inactive",
            f"เกรด {grade} ถูกปิดใช้งานแล้ว",
            grade=grade,
        )


async def _seat_seller_grade(conn: AsyncConnection, grade: str | None) -> str | None:
    """The effective grade for a seller being created (F2).

    A supplied grade must be an ACTIVE tier of this shop, else a readable 422. An
    ABSENT grade SEATS the seller in the shop's one tier when it has exactly one
    active tier -- a shop that does not grade is a ONE-TIER shop and its sellers
    need no office round trip. With several active tiers, or none, it stays NULL:
    the office grades the seller later, or the bill parks on the resolvable 424.
    """
    if grade is not None:
        await _validate_grade(conn, grade, must_be_active=True)
        return grade
    actives = (
        await conn.execute(text("SELECT code FROM grade_tiers WHERE is_active"))
    ).scalars().all()
    return actives[0] if len(actives) == 1 else None


# ---------------------------------------------------------------------------
# uoms
# ---------------------------------------------------------------------------
class UomCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: Code
    name: Name


class UomUpdate(BaseModel):
    """`code` is absent on purpose — see the note on ProductUpdate."""

    model_config = ConfigDict(extra="forbid")
    name: Name | None = None


def _uom_payload(r: Any) -> dict:
    return {
        "id": str(r["id"]),
        "code": r["code"],
        "name": r["name"],
        "is_active": r["is_active"],
    }


_UOM_SELECT = "SELECT id, code, name, is_active FROM uoms"


async def _read_uom(conn: AsyncConnection, uom_id: uuid.UUID) -> dict | None:
    # No is_active predicate: a row-level read must answer for retired rows too.
    row = (
        await conn.execute(text(f"{_UOM_SELECT} WHERE id = :id"), {"id": uom_id})
    ).mappings().first()
    return _uom_payload(row) if row else None


@router.get("/uoms")
async def list_uoms(
    include_inactive: IncludeInactive = False,
    principal: Principal = Depends(get_principal),
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(f"{_UOM_SELECT}{_active_filter(include_inactive)} ORDER BY code")
            )
        ).mappings().all()
    return {"uoms": [_uom_payload(r) for r in rows]}


@router.post("/uoms", status_code=status.HTTP_201_CREATED)
async def create_uom(
    body: UomCreate, principal: Principal = Depends(require_admin)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        try:
            row = (
                await conn.execute(
                    text(
                        f"INSERT INTO uoms (tenant_id, code, name)"
                        f" VALUES ({_TENANT}, :code, :name)"
                        f" RETURNING id, code, name, is_active"
                    ),
                    {"code": body.code, "name": body.name},
                )
            ).mappings().one()
        except IntegrityError as e:
            _raise_for_integrity(e, body.code)
            raise
        return _uom_payload(row)


@router.patch("/uoms/{uom_id}")
async def update_uom(
    uom_id: uuid.UUID,
    body: UomUpdate,
    principal: Principal = Depends(require_admin),
) -> dict:
    changes = _changes(body, nullable=frozenset())
    async with tenant_connection(principal.tenant_id) as conn:
        if not await _update_row(conn, "uoms", uom_id, changes):
            raise _not_found("uom")
        return await _read_uom(conn, uom_id)


@router.post("/uoms/{uom_id}/deactivate")
async def deactivate_uom(
    uom_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        await _set_active(conn, "uoms", "uom", uom_id, False)
        return await _read_uom(conn, uom_id)


@router.post("/uoms/{uom_id}/activate")
async def activate_uom(
    uom_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        await _set_active(conn, "uoms", "uom", uom_id, True)
        return await _read_uom(conn, uom_id)


# ---------------------------------------------------------------------------
# product_categories
# ---------------------------------------------------------------------------
class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: Code
    name: Name


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name | None = None


def _category_payload(r: Any) -> dict:
    return {
        "id": str(r["id"]),
        "code": r["code"],
        "name": r["name"],
        "is_active": r["is_active"],
    }


_CATEGORY_SELECT = "SELECT id, code, name, is_active FROM product_categories"


async def _read_category(conn: AsyncConnection, category_id: uuid.UUID) -> dict | None:
    row = (
        await conn.execute(
            text(f"{_CATEGORY_SELECT} WHERE id = :id"), {"id": category_id}
        )
    ).mappings().first()
    return _category_payload(row) if row else None


@router.get("/product-categories")
async def list_categories(
    include_inactive: IncludeInactive = False,
    principal: Principal = Depends(get_principal),
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(
                    f"{_CATEGORY_SELECT}{_active_filter(include_inactive)} ORDER BY code"
                )
            )
        ).mappings().all()
    return {"product_categories": [_category_payload(r) for r in rows]}


@router.post("/product-categories", status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate, principal: Principal = Depends(require_admin)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        try:
            row = (
                await conn.execute(
                    text(
                        f"INSERT INTO product_categories (tenant_id, code, name)"
                        f" VALUES ({_TENANT}, :code, :name)"
                        f" RETURNING id, code, name, is_active"
                    ),
                    {"code": body.code, "name": body.name},
                )
            ).mappings().one()
        except IntegrityError as e:
            _raise_for_integrity(e, body.code)
            raise
        return _category_payload(row)


@router.patch("/product-categories/{category_id}")
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    principal: Principal = Depends(require_admin),
) -> dict:
    changes = _changes(body, nullable=frozenset())
    async with tenant_connection(principal.tenant_id) as conn:
        if not await _update_row(conn, "product_categories", category_id, changes):
            raise _not_found("product_category")
        return await _read_category(conn, category_id)


@router.post("/product-categories/{category_id}/deactivate")
async def deactivate_category(
    category_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        await _set_active(conn, "product_categories", "product_category", category_id, False)
        return await _read_category(conn, category_id)


@router.post("/product-categories/{category_id}/activate")
async def activate_category(
    category_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        await _set_active(conn, "product_categories", "product_category", category_id, True)
        return await _read_category(conn, category_id)


# ---------------------------------------------------------------------------
# products
# ---------------------------------------------------------------------------
class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: Code
    name: Name
    category_id: uuid.UUID
    uom_id: uuid.UUID


class ProductUpdate(BaseModel):
    """name / category / uom, exactly as specified.

    `code` IS NOT UPDATABLE, here or on any other entity, and that is a decision
    rather than an omission. The code is the stable human key: it is what appears
    on a printed slip, what the office reads off a historical bill, and what
    staff match against when the two lists are side by side. Renaming FE-STEEL to
    something else would silently rewrite how every past bill reads without
    touching a single stored row. Set it once at create; get it wrong and the
    fix is a new row, with the old one retired.
    """

    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    category_id: uuid.UUID | None = None
    uom_id: uuid.UUID | None = None


class PriceSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    price: Price


_PRODUCT_SELECT = (
    "SELECT p.id, p.code, p.name, p.category_id, p.uom_id, p.is_active,"
    " u.code AS uom_code, u.name AS uom_name"
    # No is_active predicate on the uom either: a product whose unit was retired
    # still has to render its unit. Retiring a uom stops it being OFFERED, it
    # does not un-say what a product is measured in.
    " FROM products p JOIN uoms u ON u.id = p.uom_id"
)


def _product_payload(r: Any, prices: dict[str, str]) -> dict:
    return {
        "id": str(r["id"]),
        "code": r["code"],
        "name": r["name"],
        "category_id": str(r["category_id"]),
        "uom_id": str(r["uom_id"]),
        "uom_code": r["uom_code"],
        "uom_name": r["uom_name"],
        "is_active": r["is_active"],
        # {"A": "12.50", "B": "12.00", ...} — strings, never floats.
        "prices": prices,
    }


async def _read_product(conn: AsyncConnection, product_id: uuid.UUID) -> dict | None:
    row = (
        await conn.execute(text(f"{_PRODUCT_SELECT} WHERE p.id = :id"), {"id": product_id})
    ).mappings().first()
    if row is None:
        return None
    prices = (
        await conn.execute(
            text(
                "SELECT grade, price FROM product_prices"
                " WHERE product_id = :p ORDER BY grade"
            ),
            {"p": product_id},
        )
    ).mappings().all()
    return _product_payload(row, {p["grade"]: str(p["price"]) for p in prices})


async def _require_product(conn: AsyncConnection, product_id: uuid.UUID) -> None:
    """Refuse early rather than let a composite FK violation become a 500."""
    found = (
        await conn.execute(
            text("SELECT 1 FROM products WHERE id = :id"), {"id": product_id}
        )
    ).first()
    if found is None:
        raise _not_found("product")


async def _require_refs(conn: AsyncConnection, changes: dict[str, Any]) -> None:
    """category_id / uom_id must resolve IN THIS TENANT, and must not be retired.

    The composite FKs (tenant_id, category_id) -> product_categories make a
    cross-tenant reference structurally impossible, but they enforce it by
    raising, and that raise is a 500. Checking first turns it into a named 422:
    permanent and terminal, which is what it is.

    A RETIRED category or uom is refused too. Filing a NEW product under a
    category the shop has just taken out of use would quietly resurrect it in
    every grouping and report, which is the opposite of what deactivating it
    meant. Existing products keep theirs — this is a check on the write, not a
    cascade.
    """
    for field, table, entity in (
        ("category_id", "product_categories", "category"),
        ("uom_id", "uoms", "uom"),
    ):
        ref_id = changes.get(field)
        if ref_id is None:
            continue
        found = (
            await conn.execute(
                text(f"SELECT is_active FROM {table} WHERE id = :id"), {"id": ref_id}
            )
        ).mappings().first()
        if found is None:
            raise _invalid(
                f"{entity}_not_found",
                "ไม่พบข้อมูลอ้างอิงนี้ในร้านของคุณ",
                field=field,
                value=str(ref_id),
            )
        if not found["is_active"]:
            raise _invalid(
                f"{entity}_inactive",
                "ข้อมูลอ้างอิงนี้ถูกปิดใช้งานแล้ว",
                field=field,
                value=str(ref_id),
            )


@router.get("/products")
async def list_products(
    include_inactive: IncludeInactive = False,
    principal: Principal = Depends(get_principal),
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(
                    f"{_PRODUCT_SELECT}"
                    f"{_active_filter(include_inactive, 'p.is_active')}"
                    f" ORDER BY p.code"
                )
            )
        ).mappings().all()
        prices = (
            await conn.execute(
                text(
                    "SELECT product_id, grade, price FROM product_prices"
                    " ORDER BY product_id, grade"
                )
            )
        ).mappings().all()

    by_product: dict[str, dict[str, str]] = {}
    for pr in prices:
        by_product.setdefault(str(pr["product_id"]), {})[pr["grade"]] = str(pr["price"])

    return {
        "products": [
            _product_payload(r, by_product.get(str(r["id"]), {})) for r in rows
        ]
    }


@router.post("/products", status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate, principal: Principal = Depends(require_admin)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        await _require_refs(
            conn, {"category_id": body.category_id, "uom_id": body.uom_id}
        )
        try:
            new_id = (
                await conn.execute(
                    text(
                        f"INSERT INTO products (tenant_id, category_id, uom_id, code, name)"
                        f" VALUES ({_TENANT}, :c, :u, :code, :name)"
                        f" RETURNING id"
                    ),
                    {
                        "c": body.category_id,
                        "u": body.uom_id,
                        "code": body.code,
                        "name": body.name,
                    },
                )
            ).scalar_one()
        except IntegrityError as e:
            _raise_for_integrity(e, body.code)
            raise
        # A brand-new product has NO price tiers. That is not an oversight — it
        # is the 424 product_price_unset path in bills.py, and it is the correct
        # state until the office sets prices. Never invent one
        # (lessons/fallback-default-is-a-wrong-number.md).
        return await _read_product(conn, new_id)


@router.patch("/products/{product_id}")
async def update_product(
    product_id: uuid.UUID,
    body: ProductUpdate,
    principal: Principal = Depends(require_admin),
) -> dict:
    changes = _changes(body, nullable=frozenset())
    async with tenant_connection(principal.tenant_id) as conn:
        await _require_refs(conn, changes)
        if not await _update_row(conn, "products", product_id, changes):
            raise _not_found("product")
        return await _read_product(conn, product_id)


@router.post("/products/{product_id}/deactivate")
async def deactivate_product(
    product_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    """Retire a product. IT KEEPS ANSWERING FOR EVERY BILL THAT REFERENCES IT.

    Nothing cascades and nothing is rewritten: its price tiers stay, its row
    stays, and bills.py resolves its code and name for historical bills with no
    is_active predicate. What changes is only that GET /products stops offering
    it and POST /bills refuses a NEW bill against it (424, resolvable — the yard
    may already have tipped that load, and reactivating makes the same bill go
    through unchanged).
    """
    async with tenant_connection(principal.tenant_id) as conn:
        await _set_active(conn, "products", "product", product_id, False)
        return await _read_product(conn, product_id)


@router.post("/products/{product_id}/activate")
async def activate_product(
    product_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        await _set_active(conn, "products", "product", product_id, True)
        return await _read_product(conn, product_id)


@router.put("/products/{product_id}/prices/{grade}")
async def set_product_price(
    product_id: uuid.UUID,
    grade: str,
    body: PriceSet,
    principal: Principal = Depends(require_admin),
) -> dict:
    """Set or replace ONE price tier.

    THIS CHANGES THE FUTURE ONLY. Historical bills carry their own unit_price and
    list_price on the row (hard rule 6) and nothing ever recomputes them from
    here — the server stamps list_price at the moment the bill is created and it
    is frozen from then on. The yard's cached copy of this list is a separate
    concern with its own staleness rule
    (lessons/cached-master-data-is-a-price-claim.md).

    `grade` is now a per-tenant tier CODE (S16 / P1.24), validated against this
    shop's grade_tiers below -- must_be_active=False, because a shop may price any
    tier it holds, active or not. A foreign code is a readable 422, not the
    composite FK's IntegrityError 500.
    """
    async with tenant_connection(principal.tenant_id) as conn:
        await _require_product(conn, product_id)
        await _validate_grade(conn, grade, must_be_active=False)
        await conn.execute(
            text(
                f"INSERT INTO product_prices (tenant_id, product_id, grade, price)"
                f" VALUES ({_TENANT}, :p, :g, :price)"
                f" ON CONFLICT (tenant_id, product_id, grade)"
                f" DO UPDATE SET price = EXCLUDED.price"
            ),
            {"p": product_id, "g": grade, "price": body.price},
        )
        return await _read_product(conn, product_id)


# ---------------------------------------------------------------------------
# sellers
# ---------------------------------------------------------------------------
# Free text, and generously sized, because all three are transcribed by hand at
# a weighbridge. id_number is NOT validated as a 13-digit national id: a shop
# also buys from companies and from walk-ins carrying a passport or nothing at
# all, and a format check here would refuse the purchase rather than the typo.
IdNumber = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
Address = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
VehicleNo = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]

# The opaque secret naming a reservation. BOUNDED at the edge like every other
# string here, and for the ordinary reason: an unbounded field is a request body
# a caller chooses the size of. 200 is comfortably above the 43 characters
# secrets.token_urlsafe(32) produces, so the bound cannot become the thing that
# refuses a legitimate token if the mint ever widens.
#
# NO SHAPE CONSTRAINT. The server compares it against a stored value; it never
# parses it, and a client-side pattern would be this module guessing at how the
# refill mints. Migration 0012 gives the same argument at the column.
ReservationToken = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]


class SellerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # OPTIONAL, and absent does NOT mean "no code" — it means the SERVER assigns
    # one. See the assignment block above create_seller for the mechanism and for
    # why both halves exist (ROADMAP D2, S6): a shop with a paper code system
    # supplies its own and keeps it; a shop without one never has to invent a
    # unique string at the weighbridge with a truck waiting.
    code: Code | None = None
    # THE RESERVATION THIS CREATE SPENDS, and the reason a repeat of this request
    # is not a second seller. A yard phone that created the seller offline holds
    # a code AND the token the server minted with it; carrying the token makes a
    # replay recognisable BY THE SERVER as the same create, so a response lost on
    # a bad connection costs a lookup instead of a duplicate person.
    #
    # ABSENT IS THE ORDINARY CASE and always will be: the desktop, the counter
    # and every online create send no token. Present WITHOUT `code` is refused —
    # a token names exactly one code, and a request that carries the secret but
    # not the value it unlocks is incoherent rather than merely incomplete.
    reservation_token: ReservationToken | None = None
    name: Name
    phone: Phone | None = None
    # Optional at create. A supplied grade must be one of the shop's ACTIVE tiers
    # (validated in create_seller); absent SEATS the seller in the shop's one tier
    # when it has exactly one (F2 -- a one-tier shop needs no office round trip),
    # and otherwise stays NULL, refused at bill time with the resolvable 424
    # (seller_grade_unset). Seating in the SOLE tier is not a guess -- it is the
    # only grade the shop has; inventing one among several would be
    # (lessons/fallback-default-is-a-wrong-number.md).
    grade: GradeCode | None = None
    # SRS 1.6. All optional: a yard weighs a walk-in's scrap and pays cash long
    # before it has their address, and refusing the seller row would refuse the
    # purchase. NOTE this vehicle_no is the one the seller USUALLY arrives in —
    # purchase_bills.vehicle_no is the truck that actually turned up that day.
    # Two different facts; do not collapse them.
    id_number: IdNumber | None = None
    address: Address | None = None
    vehicle_no: VehicleNo | None = None


class SellerUpdate(BaseModel):
    """Everything except `code`, which is immutable — see ProductUpdate."""

    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    phone: Phone | None = None
    grade: GradeCode | None = None
    id_number: IdNumber | None = None
    address: Address | None = None
    vehicle_no: VehicleNo | None = None


# Every nullable seller column, so an explicit null CLEARS it. A seller who
# changes truck must be able to have the old one removed, not merely replaced.
_SELLER_NULLABLE = frozenset({"phone", "grade", "id_number", "address", "vehicle_no"})


def _seller_payload(r: Any) -> dict:
    return {
        "id": str(r["id"]),
        "code": r["code"],
        "name": r["name"],
        "phone": r["phone"],
        # Seller grade selects which product_prices tier applies (SRS 1.6).
        "grade": r["grade"],
        "id_number": r["id_number"],
        "address": r["address"],
        "vehicle_no": r["vehicle_no"],
        "is_active": r["is_active"],
    }


_SELLER_SELECT = (
    "SELECT id, code, name, phone, grade, id_number, address, vehicle_no, is_active"
    " FROM sellers"
)


async def _read_seller(conn: AsyncConnection, seller_id: uuid.UUID) -> dict | None:
    row = (
        await conn.execute(text(f"{_SELLER_SELECT} WHERE id = :id"), {"id": seller_id})
    ).mappings().first()
    return _seller_payload(row) if row else None


@router.get("/sellers")
async def list_sellers(
    include_inactive: IncludeInactive = False,
    principal: Principal = Depends(get_principal),
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(f"{_SELLER_SELECT}{_active_filter(include_inactive)} ORDER BY code")
            )
        ).mappings().all()
    return {"sellers": [_seller_payload(r) for r in rows]}


# ---------------------------------------------------------------------------
# Seller history at the weighbridge (P1.21) — the reading half.
#
#   GET /sellers/{seller_id}/history?limit=5
#
# When staff pick a seller on the phone, they see what that seller last sold:
# when, what, how much (P1.21). Nothing new is stored — this lists rows that
# already exist. Every DECISION below is written down because each is a place a
# plausible alternative would return a wrong answer.
#
# WHO MAY READ IT, AND WHAT OF IT — get_principal, then money is gated in-handler.
# Recognising a returning seller is the feature's whole purpose, so the NON-money
# facts (the date, the products, the weights) go to any signed-in user; a
# cross-tenant read is impossible, and that is RLS (below), not a role check.
# MONEY is different. Per D1 (ROADMAP § P1.23 item 4, 2026-08-30) staff see no
# money unless the shop owner turns tenants.staff_money_visible on. So
# total_amount (per bill) and unit_price (per line) are present ONLY for an admin,
# or a staff caller when staff_money_visible is true; otherwise THE KEYS ARE
# ABSENT — not null, not zero, because an absent key cannot be rendered as a
# number by mistake (lessons/fallback-default-is-a-wrong-number.md) — and every
# response carries money_included so the phone can say WHY prices are hidden
# rather than guess.
#
#   THE ADVISOR'S READING, built to here and reported as such for the owner to
#   overrule (this file does not settle it): the money gate is admin OR
#   staff_money_visible, with NO created_by = self restriction. That is BROADER
#   than E1 (OPEN_ITEMS, 2026-08-31), which scopes a staff caller on the AGGREGATE
#   /reports/summary to their OWN bills — the difference is deliberate. Seller
#   history is a per-seller listing whose purpose is recognising the seller across
#   every visit, not a shop-wide aggregate; a staff caller with the toggle on
#   therefore sees the money on ALL of this seller's recent bills, including loads
#   weighed by other staff. The owner reconciles the two if he wants seller-history
#   money own-weighed only.
#
# VOIDED BILLS ARE INCLUDED AND MARKED (is_void true). A seller's history that
# silently dropped voided loads would misstate what happened at the yard. There is
# no is_void column — void is derived from voided_at IS NOT NULL, the same
# derivation bills._read_bill uses for its status field.
#
# THE EMPTY CASE IS A REQUIREMENT, not a courtesy (P1.21 DONE WHEN). A seller with
# no prior bills returns 200 with bills: [] and seller_id echoed, distinguishable
# from a failure AND from an unknown seller. An unknown seller, or one in another
# tenant, is 404 (_not_found("seller"), code seller_not_found): RLS makes a
# cross-tenant row INVISIBLE, so _read_seller sees zero rows and raises — never a
# 403, never an empty list, so the API cannot be used to probe which ids exist in
# a shop you do not belong to (the _not_found docstring's own guarantee).
#
# ONE SNAPSHOT. The existence check, the money-visibility read and the read that
# builds the answer run in ONE repeatable-read transaction, so the answer is one
# instant. A read-only repeatable read cannot raise 40001.
#
# TENANT SCOPING IS RLS — not one hand-written WHERE tenant_id (this file's own
# rule above; ARCHITECTURE §8.1 rule 2, §8.2). The only predicate is seller_id,
# which is the subject, not tenant isolation. WEIGHT is net_weight — the one the
# stored amount was computed on (bills._line_amount: round(net_weight *
# unit_price, 2), ROUND_HALF_UP). Money and weight are decimal STRINGS straight
# from the NUMERIC columns (bills._read_bill's serialisation), never a JSON number
# (ARCHITECTURE §5). server_received_at converts to shop time from
# config.SHOP_TIMEZONE and from nowhere else (ARCHITECTURE §6, ONE conversion);
# the BE year is the phone's to derive, AFTER that conversion.
#
# NO cursor and NO date range in v1, a deliberate choice (the picker wants the
# last few loads and limit bounds them), recorded in OPEN_ITEMS — not an omission.
# ---------------------------------------------------------------------------
_HISTORY_DEFAULT_LIMIT = 5
_HISTORY_MAX_LIMIT = 20

# The seller's bills, newest first, each bill's lines joined to the product name.
# LEFT JOIN products with NO is_active predicate — a retired product must still
# resolve on the day it traded, exactly as bills._read_bill (INNER would silently
# drop a line and misstate the load). The LIMIT sits INSIDE the CTE so it bounds
# BILLS, not rows. Ordered server_received_at DESC, then id DESC (a deterministic
# tiebreak when two loads share the same instant), then line_no within a bill.
# NEVER device_created_at and NEVER doc_no as the sort key
# (lessons/doc-no-is-arrival-order-not-event-time.md): arrival order is what a
# report keys on, and doc_no is text so its order is not even numeric.
_SELLER_HISTORY_SQL = """
WITH b AS (
    SELECT id, doc_no, total_amount, server_received_at, voided_at
      FROM purchase_bills
     WHERE seller_id = :seller_id
     ORDER BY server_received_at DESC, id DESC
     LIMIT :limit
)
SELECT b.id AS bill_id, b.doc_no, b.total_amount, b.server_received_at,
       b.voided_at, i.line_no, i.product_id, i.net_weight, i.unit_price,
       p.name AS product_name
  FROM b
  LEFT JOIN purchase_bill_items i ON i.bill_id = b.id
  LEFT JOIN products p ON p.id = i.product_id
 ORDER BY b.server_received_at DESC, b.id DESC, i.line_no
"""


@router.get("/sellers/{seller_id}/history")
async def seller_history(
    seller_id: uuid.UUID,
    limit: int = Query(_HISTORY_DEFAULT_LIMIT, ge=1, le=_HISTORY_MAX_LIMIT),
    # get_principal, NOT require_admin: staff READ history (it is the weighbridge's
    # purpose); money is gated inside the handler, never by a route refusal.
    principal: Principal = Depends(get_principal),
) -> dict:
    """A seller's recent bills at the weighbridge — when, what, how much (P1.21).

    Returns ``{seller_id, money_included, limit, bills}``, newest first by
    server_received_at. Each bill carries ``bill_id``, ``doc_no`` (null until it
    syncs), ``server_received_at`` and the shop-local ``received_date``,
    ``is_void``, and ``products`` — one entry per bill line with ``product_id``,
    ``product_name`` (null if the product was retired) and ``net_weight`` (the
    weight the stored amount was computed on). ``total_amount`` (per bill) and
    ``unit_price`` (per line) are present ONLY when ``money_included`` — admin, or
    staff with the shop's staff_money_visible on; otherwise the KEYS ARE ABSENT
    and money_included is false, so the phone says why rather than render a guess.

    Voided bills are INCLUDED and marked ``is_void``. A seller with no prior bills
    is 200 with ``bills: []`` (distinguishable from a failure); an unknown seller,
    or one in another tenant, is 404 (``seller_not_found``) — RLS makes a
    cross-tenant row invisible, so it is never a 403 and never an empty list.
    """
    async with tenant_connection(
        principal.tenant_id, isolation_level="REPEATABLE READ"
    ) as conn:
        # Existence FIRST, so an unknown or cross-tenant seller is a 404 the caller
        # can tell apart from a seller who simply has no bills yet. RLS makes
        # another tenant's seller INVISIBLE -> _read_seller returns None -> 404.
        if await _read_seller(conn, seller_id) is None:
            raise _not_found("seller")

        # The per-shop money switch, read inside the snapshot. RLS scopes it to
        # this shop's single row. Admin always sees money; a staff caller only when
        # the owner has turned it on (D1). This is the WHOLE money gate here (G2 /
        # the advisor's reading) — there is no created_by = self scope.
        money_visible = (
            await conn.execute(text("SELECT staff_money_visible FROM tenants"))
        ).scalar_one()
        money_included = principal.role == ADMIN_ROLE or bool(money_visible)

        rows = (
            await conn.execute(
                text(_SELLER_HISTORY_SQL),
                {"seller_id": seller_id, "limit": limit},
            )
        ).mappings().all()

    # Group the flat rows into bills, preserving the query's newest-first order.
    bills: list[dict] = []
    by_id: dict[str, dict] = {}
    for r in rows:
        bill_id = str(r["bill_id"])
        bill = by_id.get(bill_id)
        if bill is None:
            # ONE conversion, from the ONE server-side offset (config.SHOP_TIMEZONE).
            # received_date is the shop day; the phone derives the BE year AFTER
            # this conversion (ARCHITECTURE §6), never before.
            local = r["server_received_at"].astimezone(SHOP_TIMEZONE)
            bill = {
                "bill_id": bill_id,
                "doc_no": r["doc_no"],
                "server_received_at": local.isoformat(),
                "received_date": local.date().isoformat(),
                "is_void": r["voided_at"] is not None,
                "products": [],
            }
            if money_included:
                # The bill's stored total, straight from NUMERIC(14,2) as a string
                # (bills._read_bill), never recomputed from today's prices.
                bill["total_amount"] = str(r["total_amount"])
            by_id[bill_id] = bill
            bills.append(bill)
        # A line-less bill cannot occur (POST /bills requires items), but the LEFT
        # JOIN would yield a null line for one if it ever did — skip it rather than
        # invent an empty product row.
        if r["line_no"] is None:
            continue
        line = {
            "product_id": str(r["product_id"]),
            "product_name": r["product_name"],
            "net_weight": str(r["net_weight"]),
        }
        if money_included:
            line["unit_price"] = str(r["unit_price"])
        bill["products"].append(line)

    return {
        "seller_id": str(seller_id),
        "money_included": money_included,
        "limit": limit,
        "bills": bills,
    }


# ---------------------------------------------------------------------------
# The server-assigned seller code (ROADMAP D2 / S6)
# ---------------------------------------------------------------------------
# THE SELLER CODE IS THE SELLER'S doc_no, and hard rule 3 already draws this line
# for bills: the client mints the id it needs, the SERVER assigns the
# human-readable number. A staff member with a truck on the weighbridge must not
# be asked to invent a unique string, because the failure mode is a 409 on a
# screen at five in the morning with a queue behind it.
#
# GENERATE-THEN-RETRY, which is the THIRD of this repository's three existing
# precedents — the one already half-present at _raise_for_integrity above, which
# names uq_sellers_tenant_code and turns it into a 409. The other two were read
# and rejected, and the reasons are recorded so this is not re-argued:
#
#   * doc_no_counters (bills.py:515-535) buys a GAP-FREE sequence. That is what a
#     legal document number needs and what a seller label does not. It would cost
#     a new counter table — sellers are not year-scoped, so the existing
#     (tenant_id, be_year) key does not fit — and it would STILL need this retry
#     underneath it, because a counter cannot know that a human has already typed
#     `S006` by hand into the same unique namespace, which D2 explicitly permits.
#     A mechanism that needs the fallback anyway should be the fallback.
#   * provision_shop.code_shape_from_constraint derives its alphabet and length
#     FROM a CHECK constraint, and mints with `secrets`. There is no CHECK on
#     `sellers.code` to derive from — measured 2026-08-17 against a restored copy:
#     ck_sellers_grade, sellers_pkey, the tenant FK, uq_sellers_tenant_code,
#     uq_sellers_tenant_id, and nothing on `code`. Its randomness is also load
#     bearing for a DIFFERENT reason that does not apply here: a shop code is
#     typed by an outsider at an unauthenticated endpoint, so a predictable one
#     narrows an enumeration. A seller code is read off a slip by the shop that
#     issued it.
#
# WHAT MAKES IT CORRECT UNDER CONCURRENCY — two phones creating a seller in the
# same second. THE UNIQUE INDEX IS THE ARBITER; THE SELECT ONLY PROPOSES. Under
# READ COMMITTED both requests genuinely can read the same maximum, and that is
# survivable: the second INSERT then BLOCKS on uq_sellers_tenant_code until the
# first transaction ends, and comes back 23505. The loser rolls back to its
# SAVEPOINT — not the whole request — re-reads a maximum that now includes the
# winner's committed row, and inserts. Nobody is handed a 409 they did not
# deserve, and the loop cannot spin: the index block is what paces it.
#
# A naive `SELECT max(code)+1` with no constraint underneath is the failure this
# replaces: it hands both phones the same string and 409s one of them.
_ASSIGNED_CODE_SHAPE = "^S[0-9]+$"   # the shape THIS server assigns, and only it
_ASSIGNED_CODE_WIDTH = 3             # S001, widening on its own past S999
_ASSIGN_ATTEMPTS = 8


# `_next_seller_code` STOOD HERE AND IS GONE. It derived the candidate from
# `max(code)` over `sellers` ALONE, which stopped being the whole of the assigned
# code space the day migration 0012 landed: a code reserved to a handset is a
# code that handset WILL write into `sellers`, and a maximum that cannot see one
# proposes it to somebody at the counter with nobody making a mistake.
#
# IT IS DELETED RATHER THAN LEFT UNUSED, and that is the point of removing it at
# all. An unused function that reads one of the two tables, sitting beside the
# one that reads both, is not dead weight — it is the function the next writer
# calls, because it has the obvious name and it compiles. The replacement is
# _next_assigned_codes below.
#
# ROADMAP's design states the required decision as "`_next_seller_code` must skip
# codes present in the reservation relation" and names it there. The JOB moved
# and the NAME did not survive; the design is not edited for it, and the stale
# reference is recorded at the phase boundary rather than repaired by keeping a
# wrapper alive to make a document's noun resolve.


# ---------------------------------------------------------------------------
# THE ASSIGNED CODE SPACE HAS TWO WRITERS, AND THIS IS THE DERIVATION THEY MUST
# SHARE (ROADMAP P1.8b, the seller-kind design)
# ---------------------------------------------------------------------------
# `sellers` is no longer the only table holding an assigned-shape code. A code
# reserved to a handset is a code that handset WILL write into `sellers` when it
# comes back, so the next candidate has to be derived above BOTH tables or the
# server hands a device's code to somebody at the counter -- and neither of them
# does anything wrong.
#
# THE MAXIMUM IS TAKEN IN ONE EXPRESSION, over the UNION, and the candidate is
# its successor. That is a decision and not a style: the alternative -- derive
# from `sellers`, then check the candidate against the reservations and retry --
# CANNOT WORK, and the reason is arithmetic rather than a risk to be sized. The
# retry above it survives a lost race because the WINNER'S COMMIT MOVES THE
# TABLE THE CANDIDATE IS DERIVED FROM. A reservation moves nothing in `sellers`,
# so a post-check re-derives the IDENTICAL value on every one of its attempts
# and spends the whole budget on one number. ONE reserved code is enough to
# refuse an online create at the counter with certainty.
#
# Deriving ABOVE the whole block rather than merely OUTSIDE it is also the only
# answer consistent with the sequence a shop's paper slips carry.
#
# THE SHAPE FILTER IS ON BOTH SIDES, AND IT IS WHAT KEEPS THE CAST TOTAL. Every
# code in the reservation relation is minted by this function, so today the
# filter changes nothing there -- but `substring('A-12' from 2)::numeric` RAISES,
# and a 500 on this path is `unavailable` to a yard phone. A shop running its own
# paper codes keeps them, and they neither move this number nor are moved by it.
#
# RLS scopes both halves; there is no WHERE tenant_id here and there must not be.
_ASSIGNED_CODE_UNION = (
    "SELECT max(substring(code from 2)::numeric) FROM ("
    " SELECT code FROM sellers WHERE code ~ :shape"
    " UNION ALL"
    " SELECT code FROM seller_code_reservations WHERE code ~ :shape"
    ") AS assigned"
)


def _format_assigned_code(number: int) -> str:
    """`S007` from 7, or the same refusal `_next_seller_code` raises.

    Split out so the two writers of this namespace cannot disagree about the
    width, the prefix, or what happens at the edge type's limit. Reachable only
    if a shop has typed an absurdly long S-code by hand.
    """
    candidate = f"S{number:0{_ASSIGNED_CODE_WIDTH}d}"
    if len(candidate) > _CODE_MAX_LENGTH:
        raise _invalid(
            "code_assignment_overflow",
            "ไม่สามารถออกรหัสผู้ขายอัตโนมัติได้ กรุณาระบุรหัสเอง",
            entity="seller",
            candidate_length=len(candidate),
            max_length=_CODE_MAX_LENGTH,
        )
    return candidate


async def _next_assigned_codes(conn: AsyncConnection, count: int) -> list[str]:
    """The next `count` assigned codes for THIS tenant, above BOTH tables.

    ONE read for the whole block: consecutive successors of one maximum. That is
    correct only while nothing else can write this namespace between the read and
    the INSERT, which is what _lock_shop_for_code_assignment below is for. A
    caller that does not hold that lock is minting on a hope.
    """
    highest = (
        await conn.execute(
            text(_ASSIGNED_CODE_UNION), {"shape": _ASSIGNED_CODE_SHAPE}
        )
    ).scalar_one()
    nxt = 1 if highest is None else int(highest) + 1
    return [_format_assigned_code(nxt + i) for i in range(count)]


async def _lock_shop_for_code_assignment(conn: AsyncConnection) -> int:
    """Serialise this tenant's writers of the assigned code space, and return the
    target holding while the lock is held.

    WHY A LOCK AT ALL, when the unique index is the arbiter everywhere else in
    this module: because it is the arbiter for TWO CREATES and is SILENT about a
    create racing a refill. Those two write DIFFERENT TABLES, so both commit,
    and a reserved code lands in `sellers` with nobody making a mistake. There is
    no constraint that can see across the two, so there has to be a lock.

    WHY THE TENANT'S OWN ROW. It is an object that already exists; it is already
    under a tenant-keyed RLS policy, so a mistake cannot reach another shop's
    row; the refill has to read this row anyway for the target; and it is
    released by the COMMIT rather than at some later moment nobody owns. An
    advisory key was weighed and refused -- it is not RLS-scoped, and a lock that
    appears nowhere in the schema is a lock the next writer does not know to take.

    ITS RESIDUAL, STATED RATHER THAN HIDDEN: this is a rule a future writer can
    forget, and no constraint refuses them. A third path that mints an
    assigned-shape code without taking this lock is not a compile error and not a
    violated key -- it is a silent re-opening of the hole. What would remove the
    residual entirely is a single relation holding every assigned code, so that a
    primary key is the arbiter for both writers and no lock is remembered
    anywhere; that is a larger design, and its price is a nullable holder, a
    token for rows that have no device, and a backfill across every seller a shop
    already has.

    FOR NO KEY UPDATE, AND NOT FOR UPDATE, AND THE DIFFERENCE IS NOT A DETAIL.
    `tenants.id` is referenced by a foreign key from EVERY tenant-scoped table,
    and an INSERT's FK check takes FOR KEY SHARE on the parent row. FOR UPDATE
    conflicts with FOR KEY SHARE; FOR NO KEY UPDATE does not. So FOR UPDATE here
    would serialise the two code writers AND stall every insert of every
    tenant-scoped row in the shop -- a bill on the weighbridge included -- for the
    length of a refill, on every sync pass from every device.

    MEASURED ON THIS CLUSTER, PostgreSQL 16.14, 2026-08-24, with a 1.5 s hold and
    a no-holder control reading 3-5 ms:

        holder mode            INSERT of a child row     the other writer's lock
        ------------------     ----------------------    ----------------------
        (nobody)                      4.6 ms  free              2.7 ms  free
        FOR UPDATE                 1506.0 ms  BLOCKED        1508.8 ms  BLOCKED
        FOR NO KEY UPDATE             3.2 ms  free           1511.5 ms  BLOCKED

    The bottom row is exactly what this lock is for: the two writers of the
    assigned code space wait for each other and nothing else waits at all.

    No WHERE and no tenant_id, for the reason _read_shop has none: the tenants
    policy is FORCED and this connection carries SET LOCAL app.tenant_id, so
    exactly one row is visible. Asserting that is what turns "the policy is doing
    its job" from an assumption into a check -- 0 would mean no tenant context.
    """
    row = (
        await conn.execute(
            text("SELECT seller_code_target_holding FROM tenants"
                 " FOR NO KEY UPDATE")
        )
    ).mappings().first()
    if row is None:
        # The same named refusal update_shop raises for the same condition, and
        # for its reason: an unhandled 500 here is `unavailable` to a client,
        # which retries it forever.
        raise _invalid("shop_not_scoped", "ไม่พบร้านของผู้ใช้นี้", rowcount="0")
    return int(row["seller_code_target_holding"])


# The seller INSERT, held ONCE. Two writers use it — the ordinary create and the
# one that spends a reservation in the same statement — and a second copy of this
# column list is a second place for a column to be forgotten the day one is added.
_SELLER_INSERT = (
    f"INSERT INTO sellers (tenant_id, code, name, phone, grade,"
    f" id_number, address, vehicle_no, created_by)"
    f" VALUES ({_TENANT}, :code, :name, :phone, :grade,"
    f" :id_number, :address, :vehicle_no, :created_by)"
    f" RETURNING id, code, name, phone, grade, id_number,"
    f" address, vehicle_no, is_active"
)


def _seller_insert_params(
    body: SellerCreate, code: str, principal: Principal
) -> dict:
    """The bound values for _SELLER_INSERT. TAKES THE PRINCIPAL, not a uuid —
    `created_by` is the SESSION that created this seller and there must be no
    argument through which a different author could be supplied. Migration 0011
    states the same bound in the column comment; this signature is what makes it
    hold in the code.
    """
    return {
        "code": code,
        "name": body.name,
        "phone": body.phone,
        "grade": body.grade,
        "id_number": body.id_number,
        "address": body.address,
        "vehicle_no": body.vehicle_no,
        # THE SESSION THAT CREATED THIS SELLER, and never a field from
        # the body. SellerCreate carries no user of any kind and must
        # not: a client-supplied author is an author the client chooses.
        # principal.user_id has already been proven to name a live user
        # IN THIS TENANT by get_principal, which re-reads the users row
        # under tenant context — so the composite (tenant_id, created_by)
        # FK cannot fail here. Same argument bills.py makes at its own
        # INSERT, and it matters for the same reason: an unhandled 500 on
        # this path is `unavailable` to a yard phone with a truck on the
        # weighbridge.
        #
        # NOT in RETURNING and NOT in _seller_payload. The column is
        # written by the server and read from the database; putting it in
        # the response is a product decision with a screen attached, and
        # there is no screen.
        "created_by": principal.user_id,
    }


async def _insert_seller(
    conn: AsyncConnection, body: SellerCreate, code: str, principal: Principal
) -> Any:
    """Write the row, spending no reservation. The online path."""
    return (
        await conn.execute(
            text(_SELLER_INSERT), _seller_insert_params(body, code, principal)
        )
    ).mappings().one()


# ONE STATEMENT, and the whole reason this is not two.
#
# `held -> spent` happens ONLY inside the same statement that INSERTs the seller.
# The natural shape is an INSERT followed by a separate UPDATE, and from outside
# the two are indistinguishable: the create succeeds and the row exists either
# way. What separates them is an UPDATE that matches NOTHING and is not looked
# at — the code is then USED and the reservation is still `held`, so a later
# replay carrying that token finds a reservation it can spend AGAIN and mints a
# SECOND seller for one person.
#
# A data-modifying CTE removes the possibility rather than guarding against it.
# Postgres executes every data-modifying sub-statement in a WITH exactly once,
# and they all see the SAME snapshot — the UPDATE cannot see the row the INSERT
# is writing, and does not need to: it takes the new id from the INSERT's own
# RETURNING. The rowcount comes back in the same result, so a zero cannot go
# unread.
#
# The UPDATE is keyed on the TOKEN and on `state = 'held'`, which makes it a
# compare-and-set: if a concurrent replay spent this reservation between the read
# above and this statement, it matches nothing, the caller sees `spent_rows = 0`
# and the whole thing rolls back. RLS scopes both halves to the caller's tenant.
_SPEND_RESERVATION = (
    f"WITH ins AS ({_SELLER_INSERT}), spend AS ("
    f" UPDATE seller_code_reservations"
    f" SET state = 'spent', seller_id = (SELECT id FROM ins)"
    f" WHERE token = :reservation_token AND state = 'held'"
    f" RETURNING code)"
    f" SELECT ins.*, (SELECT count(*) FROM spend) AS spent_rows FROM ins"
)


async def _insert_seller_spending(
    conn: AsyncConnection, body: SellerCreate, code: str, principal: Principal,
    token: str,
) -> Any:
    row = (
        await conn.execute(
            text(_SPEND_RESERVATION),
            {**_seller_insert_params(body, code, principal),
             "reservation_token": token},
        )
    ).mappings().one()
    if row["spent_rows"] != 1:
        # AN UNREACHABLE STATE THAT HAS BEEN REACHED. The reservation was `held`
        # a moment ago and is not now, and no unique violation fired, so the code
        # this row carries is not the one that reservation names. Refuse and take
        # the seller down with it: a create this server cannot bind to the
        # reservation it claims to spend is exactly the wrong-seller binding the
        # whole step exists to prevent.
        #
        # 409 AND NOT 500. A 500 is `unavailable` to a yard phone and is retried
        # for ever; a 409 on this kind is `needs_review`, which leaves the row
        # owed and operator-visible instead of settling it or jamming the queue.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "kind": "conflict",
                "code": "reservation_not_held",
                "message": "รหัสที่จองไว้ถูกใช้ไปแล้ว กรุณาตรวจสอบ",
                "entity": "seller",
                "spent_rows": str(row["spent_rows"]),
            },
        )
    return row


# The reservation this create claims, read before anything is written. Keyed on
# the TOKEN, which is unique per tenant; RLS scopes it, so a token from another
# shop resolves to nothing rather than to somebody else's row.
_RESERVATION_BY_TOKEN = (
    "SELECT code, state, seller_id FROM seller_code_reservations"
    " WHERE token = :reservation_token"
)


@router.post("/sellers", status_code=status.HTTP_201_CREATED)
async def create_seller(
    body: SellerCreate,
    response: Response,
    principal: Principal = Depends(get_principal),
) -> dict:
    """Create a seller. STAFF MAY DO THIS — and this is the ONLY write here that
    staff may do.

    ROADMAP D1. Creating a seller and re-pricing the shop's product list are not
    the same risk, and `require_admin` conflated them. A yard buys from walk-ins,
    and `fk_bills_seller` refuses a bill for a seller who does not exist, so a
    shop that cannot add one in the minute the truck is on the weighbridge cannot
    buy the load. The stated intent in this module's docstring — a yard phone must
    not re-price — survives intact and is CHECKED by prove_seller_create.py:
    PUT /products/{id}/prices/{grade}, PATCH /sellers/{id}, and both seller
    activate/deactivate routes all keep require_admin.

    NOTE what staff still cannot do to a seller they just created: rename it,
    re-code it, or retire it. That asymmetry is deliberate — creating a row is
    additive and a wrong one is retired by an admin; editing one rewrites a fact
    other rows already point at.

    THREE PATHS, AND THE TOKEN DECIDES BETWEEN THEM:

      * `reservation_token` present — a handset spending a code it reserved
        before it went offline. The seller and the reservation move in ONE
        statement, and a REPLAY is answered 200 with the row the first attempt
        produced. That is hard rule 4's "already created" extended to this route
        by decision, and it is what makes a lost response cost a lookup instead
        of a second person.
      * `code` supplied without a token — the counter, the desktop, a shop with
        its own paper codes. REFUSED with `code_reserved` if a handset is holding
        that code offline; otherwise exactly one attempt, as before.
      * neither — the server mints, above BOTH tables.

    IT TAKES THE PER-TENANT LOCK ON EVERY PATH, unconditionally, before it reads
    anything. Two of the three write an assigned-shape code into `sellers` and
    the third could — `S042` typed by hand is an assigned-shape code — so a rule
    conditioned on the shape or on the path is a rule with an arm somebody gets
    wrong later. The cost is that two seller creates in ONE shop serialise, which
    `uq_sellers_tenant_code` already made them do at the INSERT, and the mode is
    FOR NO KEY UPDATE so nothing else in the shop waits at all.
    """
    async with tenant_connection(principal.tenant_id) as conn:
        # THE LOCK FIRST. Everything below either derives a code from a maximum
        # or checks a code against the reservation relation, and both are only
        # answers if nothing can write that namespace between the read and the
        # INSERT. The target holding it returns is the refill's business, not
        # this route's, and is deliberately unused here.
        await _lock_shop_for_code_assignment(conn)

        # GRADE (S16 / P1.24): validate a supplied one against the shop's active
        # tiers, or SEAT a one-tier shop's seller in its sole tier (F2). Resolved
        # ONCE here, before any of the three write paths below, so each inserts
        # the same effective grade. On the replay path its result is unused (the
        # existing seller is returned), which is harmless.
        body.grade = await _seat_seller_grade(conn, body.grade)

        if body.reservation_token is not None:
            if body.code is None:
                # A token names exactly one code. A request carrying the secret
                # and not the value it unlocks cannot be completed by guessing,
                # and inferring the code FROM the token would make the token the
                # source of the code — which is the one thing the device is
                # supposed to be holding independently.
                raise _invalid(
                    "reservation_token_without_code",
                    "คำขอนี้ไม่มีรหัสผู้ขาย",
                    entity="seller",
                )
            held = (
                await conn.execute(
                    text(_RESERVATION_BY_TOKEN),
                    {"reservation_token": body.reservation_token},
                )
            ).mappings().first()
            if held is None:
                # 422 AND NOT A RETRY. Nothing re-issues a reservation, so a
                # token this shop does not hold will never become one it does:
                # the payload can never be valid, which is exactly what a 422
                # means here and what makes it terminal on the device rather than
                # retried for ever.
                #
                # THE BODY NAMES NEITHER THE TOKEN NOR THE CODE. The token is a
                # secret and echoing one into a response is how a log or a crash
                # report comes to hold it.
                raise _invalid(
                    "reservation_not_found",
                    "ไม่พบรหัสที่จองไว้สำหรับคำขอนี้",
                    entity="seller",
                )
            if held["code"] != body.code:
                # The two halves disagree, so one of them is wrong and this
                # server cannot tell which. Spending the reservation onto the
                # supplied code would file the row under a code no reservation
                # names; spending it onto the reservation's code would file it
                # under one the device did not ask for and whose slip may already
                # be written. Refuse and name neither value.
                raise _invalid(
                    "reservation_code_mismatch",
                    "รหัสที่ส่งมาไม่ตรงกับรหัสที่จองไว้",
                    entity="seller",
                )
            if held["state"] == "spent":
                # THE ORDINARY REPLAY, and it never reaches an INSERT. The first
                # attempt committed and its response was lost; the row it made is
                # the answer. 200, not 201: this request created nothing.
                response.status_code = status.HTTP_200_OK
                existing = await _read_seller(conn, held["seller_id"])
                if existing is not None:
                    return existing
                # UNREACHABLE BY CONSTRUCTION and refused rather than assumed
                # away: ck_reservations_spent_consistency makes `spent` with a
                # null seller_id impossible, and the composite FK makes the id
                # name a row in this tenant. Reaching here means one of those is
                # gone, and answering 201 by falling through would create a
                # SECOND seller for a person who already has one.
                raise _invalid(
                    "reservation_spent_row_missing",
                    "รหัสที่จองไว้อ้างถึงผู้ขายที่ไม่พบ",
                    entity="seller",
                )
            try:
                # A SAVEPOINT for the same reason the mint loop below has one: a
                # 23505 aborts the whole transaction, and the re-read afterwards
                # would run against a dead one.
                async with conn.begin_nested():
                    row = await _insert_seller_spending(
                        conn, body, body.code, principal, body.reservation_token
                    )
            except IntegrityError as e:
                # ASK THE AUTHORITY, DO NOT RECOGNISE THE SYMPTOM — the rule
                # db.constraint_name_of and bills.py's own race handler both
                # state. Two byte-identical creates can overlap; the loser's
                # INSERT collides on uq_sellers_tenant_code, and whether this
                # reservation is now spent is one SELECT away.
                again = (
                    await conn.execute(
                        text(_RESERVATION_BY_TOKEN),
                        {"reservation_token": body.reservation_token},
                    )
                ).mappings().first()
                if (again is not None and again["state"] == "spent"
                        and again["seller_id"] is not None):
                    winner = await _read_seller(conn, again["seller_id"])
                    if winner is not None:
                        response.status_code = status.HTTP_200_OK
                        return winner
                # NOT the replay. The code is in `sellers` and this reservation
                # did not put it there — the state the two guards on this route
                # exist to make unreachable. It keeps its 409: an unreachable
                # state that has been reached must never be settled on.
                _raise_for_integrity(e, body.code)
                raise
            return _seller_payload(row)

        if body.code is not None:
            # THE FIRST OF THE TWO GUARDS. A supplied code that a handset is
            # holding offline is REFUSED, and the refusal has a code of its own.
            # Without it, somebody at the counter types the code a phone is
            # carrying, the row is created because the reservation is not in
            # `sellers` and uq_sellers_tenant_code is the only arbiter, and the
            # phone then drains onto a seller it did not create — the measured
            # defect, reproduced under the new design.
            #
            # `held` ONLY, and never `spent`. A spent reservation's code IS in
            # `sellers` by construction, so the unique constraint answers it and
            # `duplicate_code` is the honest word for that; this refusal is for
            # a code that is spoken for and provably absent from `sellers`.
            #
            # CHECK-THEN-INSERT IS ONLY SAFE UNDER THE LOCK taken at the top of
            # this handler. Without it a refill could commit this very code
            # between the two statements and the create would write a reserved
            # code with nobody making a mistake.
            reserved = (
                await conn.execute(
                    text("SELECT 1 FROM seller_code_reservations"
                         " WHERE code = :c AND state = 'held'"),
                    {"c": body.code},
                )
            ).first()
            if reserved is not None:
                raise _code_reserved(body.code)

            # SUPPLIED — exactly one attempt, and a collision is the caller's 409.
            # RETRYING HERE WOULD BE THE ONE OUTCOME WORSE THAN THE REFUSAL: it
            # would file the row under a code the shop did not choose, while the
            # shop's paper slip carries the one they typed, and this system never
            # sees that slip again.
            try:
                row = await _insert_seller(conn, body, body.code, principal)
            except IntegrityError as e:
                _raise_for_integrity(e, body.code)
                raise
            return _seller_payload(row)

        # THE SECOND GUARD, AND IT IS THE WORSE OF THE TWO because it needs
        # nobody to make a mistake. The candidate is derived above BOTH tables,
        # IN THE DERIVATION and never as a post-check on top of this loop: the
        # retry survives a lost race only because the winner's COMMIT moves the
        # table the candidate is read from, and a reservation moves nothing in
        # `sellers`. A post-check would therefore re-derive the identical string
        # on all eight attempts and answer 409 code_assignment_failed to an
        # online caller at the counter — with ONE code reserved, not a long block.
        #
        # THE BUDGET KEEPS THE JOB IT ALREADY HAD. Under the lock this loop
        # should never take a second attempt; it stays because the lock is a rule
        # a future writer can forget and no constraint refuses them, and because
        # a hand-typed `S006` can still collide. Over the union it still ADVANCES
        # for the original reason: the winner's row lands in `sellers`.
        for _ in range(_ASSIGN_ATTEMPTS):
            candidate = (await _next_assigned_codes(conn, 1))[0]
            try:
                # A SAVEPOINT, so a lost race costs this INSERT and not the
                # request. Without it the 23505 aborts the whole transaction and
                # the retry would run every statement against a dead one.
                # set_config ran BEFORE this savepoint, so rolling back to it
                # cannot take the tenant context with it.
                async with conn.begin_nested():
                    row = await _insert_seller(conn, body, candidate, principal)
            except IntegrityError as e:
                if constraint_name_of(e) == "uq_sellers_tenant_code":
                    continue
                # ANYTHING ELSE KEEPS ITS 500, the same rule
                # _raise_for_integrity states: a violation this loop does not
                # understand must not be dressed up as a race it survived.
                raise
            return _seller_payload(row)

        # NOT duplicate_code. The caller supplied no code, so naming one as taken
        # would be a confident lie about a value they never sent.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "kind": "conflict",
                "code": "code_assignment_failed",
                "message": "ไม่สามารถออกรหัสผู้ขายอัตโนมัติได้ กรุณาระบุรหัสเอง",
                "entity": "seller",
                "attempts": _ASSIGN_ATTEMPTS,
            },
        )


@router.patch("/sellers/{seller_id}")
async def update_seller(
    seller_id: uuid.UUID,
    body: SellerUpdate,
    principal: Principal = Depends(require_admin),
) -> dict:
    # These are nullable columns, so an EXPLICIT null clears them — which must be
    # possible: a seller can lose their grade, and the resulting bills are then
    # refused with a resolvable 424 rather than mispriced.
    changes = _changes(body, nullable=_SELLER_NULLABLE)
    async with tenant_connection(principal.tenant_id) as conn:
        # A grade being SET (not cleared) must be one of the shop's active tiers
        # (S16 / P1.24). An explicit null clears it -- the resulting bills park on
        # the resolvable 424 -- and needs no tier.
        if changes.get("grade") is not None:
            await _validate_grade(conn, changes["grade"], must_be_active=True)
        if not await _update_row(conn, "sellers", seller_id, changes):
            raise _not_found("seller")
        return await _read_seller(conn, seller_id)


@router.post("/sellers/{seller_id}/deactivate")
async def deactivate_seller(
    seller_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    """Retire a seller. Their existing bills are untouched and stay readable."""
    async with tenant_connection(principal.tenant_id) as conn:
        await _set_active(conn, "sellers", "seller", seller_id, False)
        return await _read_seller(conn, seller_id)


@router.post("/sellers/{seller_id}/activate")
async def activate_seller(
    seller_id: uuid.UUID, principal: Principal = Depends(require_admin)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        await _set_active(conn, "sellers", "seller", seller_id, True)
        return await _read_seller(conn, seller_id)


# ---------------------------------------------------------------------------
# grade tiers (S16 / P1.24) — the per-tenant price tiers a shop declares
#
# A shop declares its own tiers: at least ONE, with no product-imposed maximum
# (F1). A shop that does not grade is a shop with a SINGLE tier every seller sits
# in (F2), not a nullable grade. `code` is the stable handle every graded row
# references by composite FK; `name` is the shop's own display text and is free
# to change (F3). A tier is DEACTIVATED, never deleted — there is no DELETE route,
# the same retirement shape as the master-data tables — and deactivation is
# REFUSED while active sellers sit in the tier (F4).
# ---------------------------------------------------------------------------
_GRADE_TIER_SELECT = "SELECT id, code, name, sort_order, is_active FROM grade_tiers"


def _grade_tier_payload(r: Any) -> dict:
    return {
        "id": str(r["id"]),
        "code": r["code"],
        "name": r["name"],
        "sort_order": r["sort_order"],
        "is_active": r["is_active"],
    }


async def _read_grade_tier(conn: AsyncConnection, tier_id: uuid.UUID) -> dict | None:
    row = (
        await conn.execute(text(f"{_GRADE_TIER_SELECT} WHERE id = :id"), {"id": tier_id})
    ).mappings().first()
    return _grade_tier_payload(row) if row else None


# The shop's ordering key, bounded to int4 at the edge ONLY so an over-range value
# is a 422 rather than the column's own overflow 500 (edge-must-reject); the
# ordering itself is the shop's and carries no meaning the code assigns (F3).
SortOrder = Annotated[int, Field(ge=0, le=2147483647)]


class GradeTierCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: GradeCode
    name: GradeName
    # OPTIONAL: absent APPENDS the tier (max sort_order + 1). The ordering is the
    # shop's (F3); this default only spares it computing one for the common "add a
    # tier" case. There is NO maximum on how many tiers a shop declares (F1).
    sort_order: SortOrder | None = None


class GradeTierUpdate(BaseModel):
    """`code` is absent on purpose: it is the FK target every graded row points
    at, so it is IMMUTABLE — the shop renames the `name`, never the code (F4)."""

    model_config = ConfigDict(extra="forbid")
    name: GradeName | None = None
    sort_order: SortOrder | None = None
    is_active: bool | None = None


@router.get("/grade-tiers")
async def list_grade_tiers(
    include_inactive: IncludeInactive = False,
    principal: Principal = Depends(get_principal),
) -> dict:
    """The shop's grade tiers, ordered. STAFF-READABLE: the yard app prices with
    them and must draw the picker offline. Deactivated tiers are excluded by
    default (not offered for new work); include_inactive=true finds one again — a
    row it cannot list is a row it cannot reactivate."""
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(f"{_GRADE_TIER_SELECT}{_active_filter(include_inactive)}"
                     " ORDER BY sort_order, code")
            )
        ).mappings().all()
    return {"grade_tiers": [_grade_tier_payload(r) for r in rows]}


@router.post("/grade-tiers", status_code=status.HTTP_201_CREATED)
async def create_grade_tier(
    body: GradeTierCreate, principal: Principal = Depends(require_admin)
) -> dict:
    """Declare a tier. ADMIN ONLY (the gate every standing choice takes). A
    duplicate code is a 409 — the shop already holds that tier. NO product-imposed
    limit on how many (F1)."""
    async with tenant_connection(principal.tenant_id) as conn:
        sort_order = body.sort_order
        if sort_order is None:
            # Append. coalesce(max, -1) + 1 gives 0 for the shop's first tier.
            sort_order = (
                await conn.execute(
                    text("SELECT coalesce(max(sort_order), -1) + 1 FROM grade_tiers")
                )
            ).scalar_one()
        try:
            row = (
                await conn.execute(
                    text(
                        f"INSERT INTO grade_tiers (tenant_id, code, name, sort_order)"
                        f" VALUES ({_TENANT}, :code, :name, :so)"
                        f" RETURNING id, code, name, sort_order, is_active"
                    ),
                    {"code": body.code, "name": body.name, "so": sort_order},
                )
            ).mappings().one()
        except IntegrityError as e:
            _raise_for_integrity(e, body.code)
            raise
        return _grade_tier_payload(row)


@router.patch("/grade-tiers/{tier_id}")
async def update_grade_tier(
    tier_id: uuid.UUID,
    body: GradeTierUpdate,
    principal: Principal = Depends(require_admin),
) -> dict:
    """Rename, re-order, or (de)activate a tier. ADMIN ONLY. `code` is immutable
    (the FK target). DEACTIVATION IS REFUSED while active sellers still sit in the
    tier (F4): they must be moved to another grade first, and the refusal SAYS HOW
    MANY. 409, not 403 — it is the tier's STATE that conflicts with retirement, not
    the caller's role."""
    # None of the three is nullable (all NOT NULL columns), so an explicit null is
    # a 422 (field_not_nullable), never a clear.
    changes = _changes(body, nullable=frozenset())
    async with tenant_connection(principal.tenant_id) as conn:
        tier = await _read_grade_tier(conn, tier_id)
        if tier is None:
            raise _not_found("grade_tier")
        if changes.get("is_active") is False and tier["is_active"]:
            in_use = (
                await conn.execute(
                    text("SELECT count(*) FROM sellers WHERE grade = :c AND is_active"),
                    {"c": tier["code"]},
                )
            ).scalar_one()
            if in_use:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    detail={
                        "kind": "conflict",
                        "code": "grade_tier_in_use",
                        "message": (
                            f"ยังมีผู้ขาย {in_use} รายอยู่ในเกรดนี้ "
                            "ต้องย้ายผู้ขายไปเกรดอื่นก่อนจึงจะปิดเกรดนี้ได้"
                        ),
                        "entity": "grade_tier",
                        "sellers_in_tier": str(in_use),
                    },
                )
        await _update_row(conn, "grade_tiers", tier_id, changes)
        return await _read_grade_tier(conn, tier_id)


# ---------------------------------------------------------------------------
# seller code reservations — the codes a handset carries offline
#
# A yard phone that is offline cannot ask the server for a code, and it must not
# invent one: two handsets inventing codes in one shop collide days later and
# bind one device's local seller to a row somebody else created — a wrong seller
# on a cash purchase. So the codes are MINTED HERE, IN ADVANCE, and reserved to
# one device. Migration 0012 holds the relation and the reasoning behind its
# shape; this is the only route that writes it.
#
# THE ROUTE IS A TOP-UP TO A TARGET, NOT AN ISSUE OF N, AND THAT IS THE WHOLE
# DESIGN OF IT.
#
#   * WHAT IDENTIFIES A REQUEST: (tenant, device) and nothing else. No request
#     id, no idempotency key, no quantity. THE THING BEING ASKED FOR IS A LEVEL
#     AND NOT AN EVENT, and a level is idempotent by construction: *make this
#     device hold its target*, asked twice, is the same sentence as asked once.
#     A key would make a repeated ISSUE recognisable; making it a top-up means
#     there is no issue to repeat.
#
#   * WHAT IS MINTED: the shortfall THIS SERVER COMPUTES — the tenant's target
#     minus what this device currently holds — and never a number the caller
#     sent. A quantity on the wire is a field the server must either trust,
#     which is the leak, or ignore, which is a field nothing reads.
#
#   * WHAT IS ANSWERED, and this is the load-bearing half: EVERYTHING THE DEVICE
#     CURRENTLY HOLDS, never only what was just minted. A route that returned
#     only the new block answers a repeat with an EMPTY set — the server has
#     already topped this device up, so it mints nothing and says nothing, the
#     device's holding never grows, it asks again every pass for ever, and a
#     full block sits `held` in its name that no reclaim will ever return.
#     ONE ROUTE, TWO OPPOSITE FAILURES: mint-again burns the code space,
#     return-nothing strands the device. Only *return what it holds* is safe
#     against both, and hard rule 4's "already created" is the shape it borrows.
#
# STAFF MAY CALL IT, the same gate POST /sellers takes and for D1's argument
# unchanged: a yard that cannot obtain codes cannot buy a load.
#
# WHAT THIS ROUTE DOES NOT DO. It reclaims nothing — a code issued to a device
# that never comes back leaks for ever, which is migration 0012's decision and is
# not softened here. And it bounds ONE identity, not the NUMBER of identities: a
# caller minting reservations under device ids it invents is unaffected, and that
# is a recorded bound rather than a hole, because every such caller can already
# create sellers.
# ---------------------------------------------------------------------------
class ReservationTopUp(BaseModel):
    """The whole request. One field, and the absence of the others is the design.

    NO quantity: the server computes the shortfall. NO idempotency key: a level
    asked for twice is the same sentence. `extra="forbid"` so a client that sends
    one is refused loudly rather than having it silently ignored — a field that
    is accepted and dropped is a field the client believes in.
    """

    model_config = ConfigDict(extra="forbid")
    # Minted ON the handset and stored in its SQLite. Not a user and not a
    # tenant: the codes physically live in one device, so a person signing out
    # here and in on a spare handset must not take the holding with them.
    device_id: uuid.UUID


# Bytes of entropy per reservation token, before base64url encoding — 32 bytes
# is 256 bits and renders as 43 characters, well inside the column's text type.
# NOT a length: secrets.token_urlsafe takes a BYTE count and returns a longer
# string, and a constant named for the wrong unit is how a 32-character token
# gets shipped by somebody who read this line as the answer.
#
# There is no CHECK constraint enforcing it and there deliberately is not one:
# the property required is ENTROPY, no CHECK expresses entropy, and a
# minimum-length CHECK would read as coverage while admitting a counter of the
# same width. Migration 0012 says the same at the column comment.
_TOKEN_BYTES = 32


def _reservation_payload(r: Any) -> dict:
    return {"code": r["code"], "token": r["token"]}


# ORDER BY code is a DISPLAY order over a SET and nothing depends on it: the
# device spends whichever it likes. It is deliberately lexical rather than
# `substring(code from 2)::numeric`, which would sort correctly past the S999
# width boundary and RAISE on any row whose code is not of the assigned shape —
# trading a cosmetic ordering defect for a 500 on the route a yard phone needs.
_HELD_BY_DEVICE = (
    "SELECT code, token FROM seller_code_reservations"
    " WHERE device_id = :d AND state = 'held'"
    " ORDER BY code"
)


@router.post("/seller-code-reservations")
async def top_up_seller_code_reservations(
    body: ReservationTopUp, principal: Principal = Depends(get_principal)
) -> dict:
    """Make this device hold its shop's target number of reserved seller codes.

    200 AND NEVER 201, INCLUDING ON THE CALL THAT MINTS A WHOLE BLOCK. The
    response describes a STATE — what this device holds — and a status that
    alternated with the number of rows written would put the quantity back on the
    wire in the one place the design took it off.
    """
    async with tenant_connection(principal.tenant_id) as conn:
        # THE LOCK FIRST, BEFORE ANYTHING IS READ. Everything below derives from
        # a maximum, and a derivation is only an answer if nothing can write this
        # namespace between the read and the INSERT.
        target = await _lock_shop_for_code_assignment(conn)

        held = (
            await conn.execute(text(_HELD_BY_DEVICE), {"d": body.device_id})
        ).mappings().all()

        # max(), not a bare subtraction. A device holding MORE than target is not
        # an error to refuse — an operator lowering the target leaves every
        # handset above it — and a negative count would ask for a block of
        # nothing in a statement that must not run at all.
        shortfall = max(0, target - len(held))
        if shortfall:
            codes = await _next_assigned_codes(conn, shortfall)
            await conn.execute(
                text(
                    f"INSERT INTO seller_code_reservations"
                    f" (tenant_id, code, device_id, token, state, issued_by)"
                    f" VALUES ({_TENANT}, :code, :device_id, :token, 'held',"
                    f" :issued_by)"
                ),
                [
                    {
                        "code": code,
                        "device_id": body.device_id,
                        # ONE FRESH SECRET PER ROW, from a CSPRNG, never derived
                        # from the code or from anything the caller sent. This
                        # token is the whole of the guard on the reservation:
                        # a create carrying it is recognised as the SAME create,
                        # which is what stops a lost response producing a second
                        # seller for one person.
                        "token": secrets.token_urlsafe(_TOKEN_BYTES),
                        # THE SESSION THAT ASKED, never a field from the body,
                        # for the reason _insert_seller gives at its own
                        # created_by: a client-supplied author is an author the
                        # client chooses. get_principal has already proven this
                        # names a live user IN THIS TENANT, so the composite
                        # (tenant_id, issued_by) FK cannot fail here.
                        "issued_by": principal.user_id,
                    }
                    for code in codes
                ],
            )

        # READ BACK, ALWAYS, AND NOT ONLY WHEN SOMETHING WAS MINTED. This is the
        # answer the design requires — the device's WHOLE holding — and taking it
        # from the table rather than from `held + codes` means a repeat after a
        # lost response is repaired from the server's own view.
        rows = (
            await conn.execute(text(_HELD_BY_DEVICE), {"d": body.device_id})
        ).mappings().all()

    return {
        "device_id": str(body.device_id),
        # The level the holding is measured against, so the device does not have
        # to hold a second copy of a number the shop can change.
        "target_holding": target,
        "reservations": [_reservation_payload(r) for r in rows],
    }


# ---------------------------------------------------------------------------
# The shop itself
#
# THE FIRST ROUTE IN THIS API THAT READS OR WRITES `tenants`. Until now that
# table was written once by provision_shop.py and never touched again, which is
# why there is no existing pattern here to follow -- these two are it.
#
# NO `code` AND NO `name` HERE ON PURPOSE. A shop's name is on printed slips and
# its code is immutable by decision, so changing either is a provisioning act
# rather than a setting; this route exposes only what a shop is meant to decide
# for itself day to day.
# ---------------------------------------------------------------------------
# The shop's own address and phone, edited through PATCH /shop. The same KIND of
# hand-typed field as a seller's, so the same bounds -- 500 and 32 -- which
# migration 0013 mirrors as ck_tenants_address_len / ck_tenants_phone_len so the
# column refuses exactly what this refuses
# (lessons/edge-must-reject-what-the-column-rounds.md). NO strip_whitespace and NO
# min_length, unlike the seller `Address` and `Phone`: a settings field is cleared
# by sending null (below), so "" is not overloaded to mean "clear", and nothing
# typed here is silently altered.
ShopAddress = Annotated[str, StringConstraints(max_length=500)]
ShopPhone = Annotated[str, StringConstraints(max_length=32)]


class ShopUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # PARTIAL. An omitted field is left untouched (_changes uses
    # model_dump(exclude_unset=True)); an explicit null CLEARS the field, which
    # must be possible for each: a shop that starts grading its sellers takes the
    # default away (its bills go back to the resolvable 424 rather than a stale
    # shop-wide tier), and a shop may erase an address or phone it no longer wants
    # printed. `name` and `code` are NOT here: a shop's name is on printed slips
    # and its code is immutable by decision (9ad225e), so changing either is a
    # provisioning act, not a setting -- a `name` key is therefore a 422 under
    # extra="forbid".
    default_grade: GradeCode | None = None
    address: ShopAddress | None = None
    phone: ShopPhone | None = None
    # Whether STAFF may see money in the dashboard (P1.23 item 4, D1). Admin-only to
    # set (this route is require_admin) and default false at the column (migration
    # 0014). A boolean, and NOT in _SHOP_NULLABLE below: the column is NOT NULL, so
    # an explicit null is a refusal (field_not_nullable), not a clear -- there is no
    # "unset" state for a policy that is either on or off. Omitted leaves it
    # untouched (model_dump(exclude_unset=True)); true/false writes it.
    staff_money_visible: bool | None = None


# staff_money_visible is deliberately ABSENT: it is NOT NULL (migration 0014), so it
# cannot be cleared, only set true or false. Its omission here is what makes an
# explicit null a 422 rather than a silent no-op (see _changes).
_SHOP_NULLABLE = frozenset({"default_grade", "address", "phone"})


async def _read_shop(conn: Any) -> dict:
    # No WHERE and no tenant_id: the tenants policy is FORCED and this connection
    # carries SET LOCAL app.tenant_id, so exactly one row is visible. Nothing in
    # this row names a person -- it is the shop's own identity and its own choices.
    row = (
        await conn.execute(
            text(
                "SELECT id, name, default_grade, address, phone, staff_money_visible"
                " FROM tenants"
            )
        )
    ).mappings().one()
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "default_grade": row["default_grade"],
        "address": row["address"],
        "phone": row["phone"],
        # A boolean, NOT money and NOT a string: it is a policy flag the yard app
        # reads to know whether to render money at all (P1.23 item 4, D1). Serialised
        # as a JSON boolean, which is exactly what a flag is.
        "staff_money_visible": row["staff_money_visible"],
    }


@router.get("/shop")
async def get_shop(principal: Principal = Depends(get_principal)) -> dict:
    """The shop's own settings.

    Readable by STAFF as well as admin, deliberately: the yard app needs to know
    whether a default grade exists to explain a 424 it might otherwise present
    as the seller's fault. Nothing here is sensitive and nothing names a person
    -- it is the shop's own name, address, phone and grade choice.
    """
    async with tenant_connection(principal.tenant_id) as conn:
        return await _read_shop(conn)


@router.patch("/shop")
async def update_shop(
    body: ShopUpdate, principal: Principal = Depends(require_admin)
) -> dict:
    """Set the shop's default grade, address or phone -- or clear any of them.

    ADMIN ONLY, where GET is not: the default grade decides how every ungraded
    seller's bill is priced, for the whole shop, and address and phone are the
    shop's printed identity -- exactly the standing choices the yard must not be
    able to make while a load is on the scale. PARTIAL: only the fields sent are
    changed (see ShopUpdate).
    """
    changes = _changes(body, nullable=_SHOP_NULLABLE)
    # Only the fields the caller sent, as a dynamic SET -- the same shape
    # _update_row builds, and the keys are literals from ShopUpdate (extra="forbid"
    # so model_dump cannot produce a key outside {default_grade, address, phone}),
    # never caller strings.
    assignments = ", ".join(f"{col} = :{col}" for col in changes)
    async with tenant_connection(principal.tenant_id) as conn:
        # A default_grade being SET (not cleared) must be one of the shop's active
        # tiers (S16 / P1.24). Cleared (explicit null) takes the default away and
        # needs no tier. A foreign code is a readable 422, not the FK's 500.
        if changes.get("default_grade") is not None:
            await _validate_grade(conn, changes["default_grade"], must_be_active=True)
        # UPDATE with no WHERE, for the same reason _read_shop has none: RLS
        # scopes it to the caller's single row. Asserting the rowcount is what
        # turns "the policy is doing its job" from an assumption into a check --
        # 0 would mean no tenant context and 2 would mean the policy is gone.
        result = await conn.execute(
            text(f"UPDATE tenants SET {assignments}"),
            changes,
        )
        if result.rowcount != 1:
            raise _invalid(
                "shop_not_scoped",
                "ไม่พบร้านของผู้ใช้นี้",
                rowcount=str(result.rowcount),
            )
        return await _read_shop(conn)
