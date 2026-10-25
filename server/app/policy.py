"""The shop's declared policies: ONE reader, and the catalogue of every setting (STRUCTURE.md 1.2,
ADVISOR-DECIDED 2026-10-24).

S16 governs STORAGE -- every setting is a typed column with its own CHECK, never a bag. Reading (2) of
2026-10-24 governs POLICY -- who may change it and what a change touches. This module is where both
meet:

  * ShopPolicy / read_policy: the one place a request reads the money rules, resolving the effective
    value product -> branch -> shop. A handler that read `tenants.rounding_rule` itself would be a
    second reader free to disagree with this one about precedence.
  * SETTINGS: the catalogue. Every non-identity column of tenants, branches and products that a shop
    sets is named here with its KIND -- 'money' (changes what a line is worth: OWNER only),
    'payment' (decides who takes the money and how it may be paid: OWNER only, ruling R1 of
    2026-10-25) or 'operational' (changes how the yard works, not what anything is worth or who is
    paid: shop.settings.write) -- and the route that writes it. scripts/prove_money_rules.py compares
    this catalogue against information_schema column by column, so a column added by a migration
    without an entry here is a red, the S6 set-equality shape STRUCTURE 1.2 asks for.
  * rules_effective_at: the money rules that were in force at an instant (ruling R3) -- the value
    now, walked back over the audited UPDATEs after it.
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
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import text

from .auth import Principal, forbidden
from .permissions import OWNER_ROLE

Kind = Literal["money", "payment", "operational", "identity"]
# The kinds only the owner may change.
OWNER_KINDS: frozenset[str] = frozenset({"money", "payment"})


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
    # R1 (2026-10-25): these two decide WHO takes the money -- the weigher at the bridge or a cashier,
    # in a shift or not -- so they are the owner's, though no amount moves.
    Setting("branches", "separate_cashier", "payment", "PATCH /branches/{id}",
            "WHO records the payment (the server at the weighbridge, or the cashier)"),
    Setting("branches", "shifts_enabled", "payment", "PATCH /branches/{id}",
            "whether the counter runs cashier shifts -- who answers for the drawer"),
    # R1: the accepted payment-method set, one row per method (0021), is_active its only writable
    # column. HOW a seller may be paid is the owner's.
    Setting("branch_payment_methods", "is_active", "payment", "PUT /branches/{id}/payment-methods/{method}",
            "which payment methods the branch's counter offers"),
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
    "branch_payment_methods": frozenset({"tenant_id", "branch_id", "method", "created_at"}),
}
CATALOGUED_TABLES: tuple[str, ...] = tuple(IDENTITY_COLUMNS)

# The columns of each table that only the OWNER may write (kind money or payment).
MONEY_KEYS: dict[str, frozenset[str]] = {
    t: frozenset(s.column for s in SETTINGS if s.table == t and s.kind in OWNER_KINDS)
    for t in CATALOGUED_TABLES
}

OWNER_ONLY = "money_rule_owner_only"
OWNER_ONLY_MESSAGE = ("กติกาเรื่องเงิน (การหัก การปัดเศษ วิธีคิดราคา เกรดตั้งต้น ผู้รับชำระ และวิธีรับชำระ)"
                      " แก้ได้โดยเจ้าของร้านเท่านั้น")


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


# ---------------------------------------------------------------------------
# R3 -- the rules in force at an instant
# ---------------------------------------------------------------------------
async def _value_at(conn: Any, table: str, row_id: uuid.UUID, column: str, at: datetime, now_value: Any) -> Any:
    """`column` of one audited row as it stood at `at`: the before-image of the EARLIEST audited UPDATE
    after `at` that changed it, else the value now. audit_log is the only history a setting has (0017;
    branches since 0018); a row created after `at` reads its value now, the nearest thing to a setting
    there was. Every column read here is text or null, which ->> returns as it is."""
    row = (
        await conn.execute(
            text(
                "SELECT old_data ->> :c AS v FROM audit_log"
                " WHERE table_name = :t AND action = 'UPDATE' AND new_data ->> 'id' = :id"
                "   AND created_at > :at AND (old_data -> :c) IS DISTINCT FROM (new_data -> :c)"
                " ORDER BY created_at, id LIMIT 1"
            ),
            {"t": table, "id": str(row_id), "c": column, "at": at},
        )
    ).first()
    return now_value if row is None else row[0]


@dataclass(frozen=True)
class RulesAt:
    """The three rules a line declares, as the shop had them set at one instant (R3)."""

    rounding_rule: str
    deduction_mode: str        # the EFFECTIVE setting (product over shop): none | kg | percent | both
    pricing_basis: str


async def rules_effective_at(conn: Any, branch_id: uuid.UUID, product_id: uuid.UUID, at: datetime) -> RulesAt:
    """The shop's rules for one product at one branch at instant `at` (a line's device_created_at).
    Precedence is read_policy's: branch rounding over the shop's, product deduction over the shop's."""
    shop = (await conn.execute(text("SELECT id, rounding_rule, deduction_mode FROM tenants"))).mappings().one()
    branch_rr = (
        await conn.execute(text("SELECT rounding_rule FROM branches WHERE id = :id"), {"id": branch_id})
    ).scalar_one_or_none()
    prod = (
        await conn.execute(text("SELECT deduction_mode, pricing_basis FROM products WHERE id = :id"), {"id": product_id})
    ).mappings().one()
    shop_rr = await _value_at(conn, "tenants", shop["id"], "rounding_rule", at, shop["rounding_rule"])
    shop_dm = await _value_at(conn, "tenants", shop["id"], "deduction_mode", at, shop["deduction_mode"])
    br_rr = await _value_at(conn, "branches", branch_id, "rounding_rule", at, branch_rr)
    p_dm = await _value_at(conn, "products", product_id, "deduction_mode", at, prod["deduction_mode"])
    p_pb = await _value_at(conn, "products", product_id, "pricing_basis", at, prod["pricing_basis"])
    return RulesAt(rounding_rule=br_rr or shop_rr, deduction_mode=effective_deduction(shop_dm, p_dm),
                   pricing_basis=p_pb)


def off_rule_keys(declared_rr: str, declared_dm: str, declared_pb: str, at: RulesAt) -> list[str]:
    """Which declared rules the setting in force did not allow. A line's deduction is allowed when it
    is none, or is the mode the setting names, or the setting is `both` and the line is kg or percent."""
    keys: list[str] = []
    if declared_rr != at.rounding_rule:
        keys.append("rounding_rule")
    if declared_dm != "none" and not (declared_dm == at.deduction_mode
                                      or (at.deduction_mode == "both" and declared_dm in ("kg", "percent"))):
        keys.append("deduction_mode")
    if declared_pb != at.pricing_basis:
        keys.append("pricing_basis")
    return keys


async def flag_if_off_rule(conn: Any, *, branch_id: uuid.UUID, product_id: uuid.UUID, item_column: str,
                           item_id: uuid.UUID, rounding_rule: str, deduction_mode: str, pricing_basis: str,
                           at: datetime) -> list[str]:
    """R3: write ONE owner_flags row (kind off_rule) for a line whose declared rules the shop's setting
    at `at` did not allow, in the caller's transaction; nothing for a line that matched. The line itself
    is accepted either way -- offline money is already paid. Returns the keys that differed.
    `item_column` names the flag's subject column (purchase_item_id; sale_item_id from 0029)."""
    in_force = await rules_effective_at(conn, branch_id, product_id, at)
    keys = off_rule_keys(rounding_rule, deduction_mode, pricing_basis, in_force)
    if keys:
        assert item_column in ("purchase_item_id", "sale_item_id")
        await conn.execute(
            text(
                f"INSERT INTO owner_flags (tenant_id, branch_id, kind, {item_column}, off_rule_keys,"
                " declared_rounding_rule, effective_rounding_rule, declared_deduction_mode,"
                " effective_deduction_mode, declared_pricing_basis, effective_pricing_basis, effective_at)"
                " VALUES (NULLIF(current_setting('app.tenant_id', true), '')::uuid, :b, 'off_rule', :i, :k,"
                " :drr, :err, :ddm, :edm, :dpb, :epb, :at)"
            ),
            {"b": branch_id, "i": item_id, "k": keys, "drr": rounding_rule, "err": in_force.rounding_rule,
             "ddm": deduction_mode, "edm": in_force.deduction_mode, "dpb": pricing_basis,
             "epb": in_force.pricing_basis, "at": at},
        )
    return keys
