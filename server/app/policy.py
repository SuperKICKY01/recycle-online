"""The shop's declared policies: ONE reader, and the catalogue of every setting (STRUCTURE.md 1.2,
ADVISOR-DECIDED 2026-10-24).

S16 governs STORAGE -- every setting is a typed column with its own CHECK, never a bag. Reading (2) of
2026-10-24 governs POLICY -- who may change it and what a change touches. This module is where both
meet:

  * ShopPolicy / read_policy: the one place a request reads the money rules, resolving the effective
    value product -> branch -> shop. A handler that read `tenants.rounding_rule` itself would be a
    second reader free to disagree with this one about precedence.
  * SETTINGS: the catalogue. Every non-identity column of tenants, branches and products that a shop
    sets is named here with its KIND -- 'money' (changes what a line is worth: OWNER only) or
    'operational' (changes how the yard works, not what anything is worth: shop.settings.write) --
    and the route that writes it. scripts/prove_shop_policy.py compares this catalogue against
    information_schema column by column, so a column added by a migration without an entry here is a
    red, the S6 set-equality shape STRUCTURE 1.2 asks for.
  * require_owner: the owner identity 3a's guard uses (users.py _refuse_another_owners_account): the
    caller's role CODE read from the database in the writing transaction, compared to the fixed
    owner role -- not a permission tick, which an owner can hand to an admin. This is the second
    sanctioned place a handler compares a role name (STRUCTURE invariant 6 forbids it otherwise), and
    for the same reason 3a is: the owner seat is defined by the fixed role, and the decision was that
    money rules belong to that seat alone.

A SETTING CHANGES NEW RECORDS ONLY, by construction rather than by care: no route reads a setting to
compute a stored figure of an EXISTING row, and every line stores the rule values it was computed under
(migration 0027's snapshot). Changing a setting is an UPDATE of tenants/branches/products, which the 0017
trigger audits with the actor.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import text

from .auth import Principal, forbidden
from .permissions import OWNER_ROLE

Kind = Literal["money", "operational", "identity"]


@dataclass(frozen=True)
class Setting:
    table: str
    column: str
    kind: Kind
    writer: str          # the route that writes it, or "provisioning" / "none"
    why: str


# Every column of tenants / branches / products that is a SETTING (not the row's own identity).
# Identity columns (id, tenant_id, code, name, created_at, is_active, category_id, uom_id) are master
# data or keys, listed in IDENTITY_COLUMNS so the proof can account for every column.
SETTINGS: tuple[Setting, ...] = (
    Setting("tenants", "default_grade", "money", "PATCH /shop",
            "the tier an ungraded seller is priced at -- it decides list_price"),
    Setting("tenants", "deduction_mode", "money", "PATCH /shop",
            "how an impurity deduction may be entered; it changes net and so the amount"),
    Setting("tenants", "deduction_reason_required", "money", "PATCH /shop",
            "whether a deduction needs a reason -- a control on money taken off a seller's weight"),
    Setting("tenants", "rounding_rule", "money", "PATCH /shop", "how every line's amount is rounded"),
    Setting("tenants", "address", "operational", "PATCH /shop", "printed on the slip; worth nothing"),
    Setting("tenants", "phone", "operational", "PATCH /shop", "printed on the slip; worth nothing"),
    Setting("tenants", "seller_code_target_holding", "operational", "none",
            "how many seller codes a phone holds in reserve (provisioning default 20; no route yet)"),
    Setting("branches", "rounding_rule", "money", "PATCH /branches/{id}",
            "this branch's rounding, overriding the shop's"),
    Setting("branches", "separate_cashier", "operational", "PATCH /branches/{id}",
            "WHO records the payment (the server at the weighbridge, or the cashier); no amount moves"),
    Setting("branches", "shifts_enabled", "operational", "PATCH /branches/{id}",
            "whether the counter's shift screens are drawn (a display rule, invariant 1)"),
    Setting("branches", "doc_prefix", "identity", "provisioning",
            "the branch's document-number prefix; immutable once bills are numbered under it"),
    Setting("products", "deduction_mode", "money", "PATCH /products/{id}",
            "this product's deduction entry, overriding the shop's"),
    Setting("products", "pricing_basis", "money", "POST /products, PATCH /products/{id}",
            "what the price multiplies: weight, pieces, or one lump sum"),
)

IDENTITY_COLUMNS: dict[str, frozenset[str]] = {
    "tenants": frozenset({"id", "name", "created_at"}),
    "branches": frozenset({"id", "tenant_id", "code", "name", "address", "phone", "is_active", "created_at"}),
    "products": frozenset({"id", "tenant_id", "category_id", "uom_id", "code", "name", "is_active"}),
}

MONEY_KEYS: dict[str, frozenset[str]] = {
    t: frozenset(s.column for s in SETTINGS if s.table == t and s.kind == "money")
    for t in ("tenants", "branches", "products")
}

OWNER_ONLY = "money_rule_owner_only"
OWNER_ONLY_MESSAGE = "กติกาเรื่องเงิน (การหัก การปัดเศษ วิธีคิดราคา เกรดตั้งต้น) แก้ได้โดยเจ้าของร้านเท่านั้น"


async def require_owner(conn: Any, principal: Principal, keys: set[str]) -> None:
    """403 `money_rule_owner_only` unless the caller holds the OWNER role, read from the database in
    this transaction. `keys` are the money keys the request is changing, named in the refusal so a
    log reader sees what was refused. Called only when there is at least one."""
    role = (
        await conn.execute(
            text("SELECT r.code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = :id"),
            {"id": principal.user_id},
        )
    ).scalar_one_or_none()
    if role != OWNER_ROLE:
        raise forbidden(OWNER_ONLY, OWNER_ONLY_MESSAGE, settings=",".join(sorted(keys)))


@dataclass(frozen=True)
class ShopPolicy:
    """The money rules in force for one branch, as stored. Fields name their columns:

    deduction_mode            tenants.deduction_mode -- the phone offers a kg and/or percent box, or
                              none; a product's own deduction_mode overrides it (effective_deduction).
    deduction_reason_required tenants.deduction_reason_required -- the phone refuses to add a deducting
                              line without a reason. Never read on the server's acceptance path.
    rounding_rule             branches.rounding_rule if set, else tenants.rounding_rule -- what the phone
                              rounds a line with; the line declares it and the server re-derives.
    Proven by scripts/prove_shop_policy.py (precedence, owner-only writes, audit, the catalogue)."""

    deduction_mode: str
    deduction_reason_required: bool
    rounding_rule: str
    shop_rounding_rule: str
    branch_rounding_rule: str | None


async def read_policy(conn: Any, branch_id: uuid.UUID | None) -> ShopPolicy:
    """The ONE reader. No tenant_id in the WHERE: RLS scopes tenants to the caller's single row."""
    shop = (
        await conn.execute(
            text("SELECT deduction_mode, deduction_reason_required, rounding_rule FROM tenants")
        )
    ).mappings().one()
    branch_rule = None
    if branch_id is not None:
        branch_rule = (
            await conn.execute(text("SELECT rounding_rule FROM branches WHERE id = :id"), {"id": branch_id})
        ).scalar_one_or_none()
    return ShopPolicy(
        deduction_mode=shop["deduction_mode"],
        deduction_reason_required=bool(shop["deduction_reason_required"]),
        rounding_rule=branch_rule or shop["rounding_rule"],
        shop_rounding_rule=shop["rounding_rule"],
        branch_rounding_rule=branch_rule,
    )


def effective_deduction(policy_mode: str, product_mode: str | None) -> str:
    """A product's own deduction_mode, else the shop's."""
    return product_mode if product_mode is not None else policy_mode
