"""Master data: reads for any signed-in user, writes for ADMINS ONLY.

    GET   /uoms                          POST  /uoms
    GET   /product-categories            POST  /product-categories
    GET   /products                      POST  /products
    GET   /sellers                       POST  /sellers
                                         PATCH /uoms/{id}
                                         PATCH /product-categories/{id}
                                         PATCH /products/{id}
                                         PATCH /sellers/{id}
                                         PUT   /products/{id}/prices/{grade}

Reads are open to staff: the yard app caches this list to price a bill offline,
so a phone that cannot read master data cannot work at all. Writes are behind
require_admin, every one of them — a yard phone must not be able to re-price the
shop's product list from the weighbridge.

THERE IS NO DELETE ON THIS ROUTER, ANYWHERE, ON PURPOSE
-------------------------------------------------------
Old bills reference these rows through composite (tenant_id, id) foreign keys,
and proveCold C6 already showed what removing a referenced product does to
history: a priced line rendering with a blank code, on a bill that is legally a
receipt. The retirement path is `is_active = false`.

THAT COLUMN DOES NOT EXIST YET. sellers/products/uoms/product_categories have no
`is_active` in migrations 0001-0003, verified against the live database, so the
deactivate endpoints and "reads exclude inactive by default" are NOT in this
file. They need a migration. Until it lands, retirement has no route at all —
which is the safe direction to be missing, because the alternative on offer was
a hard delete.

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

from fastapi import APIRouter, Depends, HTTPException, status
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
Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
# Mirrors ck_sellers_grade and product_prices' CHECK. A bad grade is a 422 from
# pydantic, never a CheckViolation 500 from Postgres.
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
    return {"id": str(r["id"]), "code": r["code"], "name": r["name"]}


async def _read_uom(conn: AsyncConnection, uom_id: uuid.UUID) -> dict | None:
    row = (
        await conn.execute(
            text("SELECT id, code, name FROM uoms WHERE id = :id"), {"id": uom_id}
        )
    ).mappings().first()
    return _uom_payload(row) if row else None


@router.get("/uoms")
async def list_uoms(principal: Principal = Depends(get_principal)) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(text("SELECT id, code, name FROM uoms ORDER BY code"))
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
                        f" RETURNING id, code, name"
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
    return {"id": str(r["id"]), "code": r["code"], "name": r["name"]}


async def _read_category(conn: AsyncConnection, category_id: uuid.UUID) -> dict | None:
    row = (
        await conn.execute(
            text("SELECT id, code, name FROM product_categories WHERE id = :id"),
            {"id": category_id},
        )
    ).mappings().first()
    return _category_payload(row) if row else None


@router.get("/product-categories")
async def list_categories(principal: Principal = Depends(get_principal)) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text("SELECT id, code, name FROM product_categories ORDER BY code")
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
                        f" RETURNING id, code, name"
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
    "SELECT p.id, p.code, p.name, p.category_id, p.uom_id,"
    " u.code AS uom_code, u.name AS uom_name"
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
    """category_id / uom_id must resolve IN THIS TENANT.

    The composite FKs (tenant_id, category_id) -> product_categories make a
    cross-tenant reference structurally impossible, but they enforce it by
    raising, and that raise is a 500. Checking first turns it into a named 422:
    permanent and terminal, which is what it is.
    """
    for field, table, code in (
        ("category_id", "product_categories", "category_not_found"),
        ("uom_id", "uoms", "uom_not_found"),
    ):
        ref_id = changes.get(field)
        if ref_id is None:
            continue
        found = (
            await conn.execute(
                text(f"SELECT 1 FROM {table} WHERE id = :id"), {"id": ref_id}
            )
        ).first()
        if found is None:
            raise _invalid(
                code,
                "ไม่พบข้อมูลอ้างอิงนี้ในร้านของคุณ",
                field=field,
                value=str(ref_id),
            )


@router.get("/products")
async def list_products(principal: Principal = Depends(get_principal)) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(text(f"{_PRODUCT_SELECT} ORDER BY p.code"))
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
class SellerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: Code
    name: Name
    phone: Phone | None = None
    # Optional at create, and NOT defaulted. A seller with no grade is refused at
    # bill time with a named, resolvable 424 (seller_grade_unset); guessing a
    # grade here would instead quote a real price the yard pays cash against
    # (lessons/fallback-default-is-a-wrong-number.md).
    grade: Grade | None = None


class SellerUpdate(BaseModel):
    """name / grade / phone. `code` is immutable — see ProductUpdate.

    NOT HERE, AND NOT FOR WANT OF TRYING: id number, address and vehicle. The
    sellers table has no such columns (migrations 0001-0003, checked against the
    live database), so those three need a migration and are deliberately absent
    rather than silently dropped.
    """

    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    phone: Phone | None = None
    grade: Grade | None = None


def _seller_payload(r: Any) -> dict:
    return {
        "id": str(r["id"]),
        "code": r["code"],
        "name": r["name"],
        "phone": r["phone"],
        # Seller grade selects which product_prices tier applies (SRS 1.6).
        "grade": r["grade"],
    }


_SELLER_SELECT = "SELECT id, code, name, phone, grade FROM sellers"


async def _read_seller(conn: AsyncConnection, seller_id: uuid.UUID) -> dict | None:
    row = (
        await conn.execute(text(f"{_SELLER_SELECT} WHERE id = :id"), {"id": seller_id})
    ).mappings().first()
    return _seller_payload(row) if row else None


@router.get("/sellers")
async def list_sellers(principal: Principal = Depends(get_principal)) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(text(f"{_SELLER_SELECT} ORDER BY code"))
        ).mappings().all()
    return {"sellers": [_seller_payload(r) for r in rows]}


@router.post("/sellers", status_code=status.HTTP_201_CREATED)
async def create_seller(
    body: SellerCreate, principal: Principal = Depends(require_admin)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        try:
            row = (
                await conn.execute(
                    text(
                        f"INSERT INTO sellers (tenant_id, code, name, phone, grade)"
                        f" VALUES ({_TENANT}, :code, :name, :phone, :grade)"
                        f" RETURNING id, code, name, phone, grade"
                    ),
                    {
                        "code": body.code,
                        "name": body.name,
                        "phone": body.phone,
                        "grade": body.grade,
                    },
                )
            ).mappings().one()
        except IntegrityError as e:
            _raise_for_integrity(e, body.code)
            raise
        return _seller_payload(row)


@router.patch("/sellers/{seller_id}")
async def update_seller(
    seller_id: uuid.UUID,
    body: SellerUpdate,
    principal: Principal = Depends(require_admin),
) -> dict:
    # phone and grade are nullable columns, so an EXPLICIT null clears them —
    # which must be possible: a seller can lose their grade, and the resulting
    # bills are then refused with a resolvable 424 rather than mispriced.
    changes = _changes(body, nullable=frozenset({"phone", "grade"}))
    async with tenant_connection(principal.tenant_id) as conn:
        if not await _update_row(conn, "sellers", seller_id, changes):
            raise _not_found("seller")
        return await _read_seller(conn, seller_id)
