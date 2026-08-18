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

import uuid
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from .auth import Principal, get_principal, require_admin
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
# Mirrors ck_sellers_grade, product_prices' CHECK, and ck_tenants_default_grade.
# A bad grade is a 422 from pydantic, never a CheckViolation 500 from Postgres.
#
# FIVE SITES NOW ENCODE THIS SET, and S16 opens all of them: the two CHECKs in
# 0001, ck_sellers_grade in 0003, ck_tenants_default_grade in 0010, and this
# line. A Literal is a COMPILE-TIME type, so a set a shop chooses at run time
# cannot be one at all -- S16 does not merely invalidate a count here, it
# removes the form this constraint is written in.
Grade = Literal["A", "B", "C", "D"]
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
    grade: Grade,
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
    """
    async with tenant_connection(principal.tenant_id) as conn:
        await _require_product(conn, product_id)
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


class SellerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # OPTIONAL, and absent does NOT mean "no code" — it means the SERVER assigns
    # one. See the assignment block above create_seller for the mechanism and for
    # why both halves exist (ROADMAP D2, S6): a shop with a paper code system
    # supplies its own and keeps it; a shop without one never has to invent a
    # unique string at the weighbridge with a truck waiting.
    code: Code | None = None
    name: Name
    phone: Phone | None = None
    # Optional at create, and NOT defaulted. A seller with no grade is refused at
    # bill time with a named, resolvable 424 (seller_grade_unset); guessing a
    # grade here would instead quote a real price the yard pays cash against
    # (lessons/fallback-default-is-a-wrong-number.md).
    grade: Grade | None = None
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
    grade: Grade | None = None
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


async def _next_seller_code(conn: AsyncConnection) -> str:
    """The next `S<n>` for THIS tenant. RLS scopes the maximum; no WHERE here.

    ONLY codes of the assigned shape take part. A shop running its own paper
    codes — `A-12`, a name, a national id — keeps them, and they neither move
    this number nor are moved by it. `S006` typed by hand DOES take part, which
    is the point: the assigner must see it, or it would propose it again.
    """
    highest = (
        await conn.execute(
            text(
                "SELECT max(substring(code from 2)::numeric) FROM sellers"
                " WHERE code ~ :shape"
            ),
            {"shape": _ASSIGNED_CODE_SHAPE},
        )
    ).scalar_one()
    nxt = 1 if highest is None else int(highest) + 1
    candidate = f"S{nxt:0{_ASSIGNED_CODE_WIDTH}d}"
    if len(candidate) > _CODE_MAX_LENGTH:
        # Reachable only if a shop has typed an absurdly long S-code by hand.
        # REFUSE rather than mint a value this module's own edge type would
        # reject — the reasoning provision_shop.py gives for having no fallback:
        # a code the database accepts but the rest of the system does not expect
        # is silent and permanent, because it goes onto paper.
        raise _invalid(
            "code_assignment_overflow",
            "ไม่สามารถออกรหัสผู้ขายอัตโนมัติได้ กรุณาระบุรหัสเอง",
            entity="seller",
            candidate_length=len(candidate),
            max_length=_CODE_MAX_LENGTH,
        )
    return candidate


async def _insert_seller(
    conn: AsyncConnection, body: SellerCreate, code: str, principal: Principal
) -> Any:
    """Write the row. TAKES THE PRINCIPAL, not a uuid — `created_by` is the
    SESSION that created this seller and there must be no argument through which
    a different author could be supplied. Migration 0011 states the same bound in
    the column comment; this signature is what makes it hold in the code.
    """
    return (
        await conn.execute(
            text(
                f"INSERT INTO sellers (tenant_id, code, name, phone, grade,"
                f" id_number, address, vehicle_no, created_by)"
                f" VALUES ({_TENANT}, :code, :name, :phone, :grade,"
                f" :id_number, :address, :vehicle_no, :created_by)"
                f" RETURNING id, code, name, phone, grade, id_number,"
                f" address, vehicle_no, is_active"
            ),
            {
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
            },
        )
    ).mappings().one()


@router.post("/sellers", status_code=status.HTTP_201_CREATED)
async def create_seller(
    body: SellerCreate, principal: Principal = Depends(get_principal)
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
    """
    async with tenant_connection(principal.tenant_id) as conn:
        if body.code is not None:
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

        for _ in range(_ASSIGN_ATTEMPTS):
            candidate = await _next_seller_code(conn)
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
class ShopUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Explicit null CLEARS it, which must be possible: a shop that starts
    # grading its sellers takes the default away, and its bills go back to the
    # resolvable 424 rather than being priced off a stale shop-wide tier.
    default_grade: Grade | None = None


_SHOP_NULLABLE = frozenset({"default_grade"})


async def _read_shop(conn: Any) -> dict:
    # No WHERE and no tenant_id: the tenants policy is FORCED and this connection
    # carries SET LOCAL app.tenant_id, so exactly one row is visible.
    row = (
        await conn.execute(text("SELECT id, name, default_grade FROM tenants"))
    ).mappings().one()
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "default_grade": row["default_grade"],
    }


@router.get("/shop")
async def get_shop(principal: Principal = Depends(get_principal)) -> dict:
    """The shop's own settings.

    Readable by STAFF as well as admin, deliberately: the yard app needs to know
    whether a default grade exists to explain a 424 it might otherwise present
    as the seller's fault. Nothing here is sensitive -- it is the shop's own
    name and its own choice.
    """
    async with tenant_connection(principal.tenant_id) as conn:
        return await _read_shop(conn)


@router.patch("/shop")
async def update_shop(
    body: ShopUpdate, principal: Principal = Depends(require_admin)
) -> dict:
    """Set the shop's default grade, or clear it.

    ADMIN ONLY, where GET is not: this decides how every ungraded seller's bill
    is priced, for the whole shop, and it is exactly the kind of standing choice
    the yard must not be able to make while a load is on the scale.
    """
    changes = _changes(body, nullable=_SHOP_NULLABLE)
    async with tenant_connection(principal.tenant_id) as conn:
        # UPDATE with no WHERE, for the same reason _read_shop has none: RLS
        # scopes it to the caller's single row. Asserting the rowcount is what
        # turns "the policy is doing its job" from an assumption into a check --
        # 0 would mean no tenant context and 2 would mean the policy is gone.
        result = await conn.execute(
            text("UPDATE tenants SET default_grade = :g"),
            {"g": changes["default_grade"]},
        )
        if result.rowcount != 1:
            raise _invalid(
                "shop_not_scoped",
                "ไม่พบร้านของผู้ใช้นี้",
                rowcount=str(result.rowcount),
            )
        return await _read_shop(conn)
