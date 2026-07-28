"""Shared DEV seed identities, imported by the seeder and the proof scripts.

Fixed UUIDs so proofs are reproducible. DEV-ONLY passwords. The two tenants use
DIFFERENT admin passwords so the cross-tenant login test is meaningful, and each
has its own seller + product so the bill proof can reference them (and reference
the WRONG tenant's rows to prove cross-tenant rejection).
"""
from __future__ import annotations

import uuid

TENANT_A_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
TENANT_B_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")

ADMIN_USERNAME = "admin"
TENANT_A_PASSWORD = "tenantA-pw-123"
TENANT_B_PASSWORD = "tenantB-pw-456"

# A STAFF user per tenant. Every proof written before this phase logs in as
# `admin`, so they are untouched; this account exists so the role gate can be
# proven from the refused side, which is the only side that matters. Without a
# real staff token, "admin-only" is a claim about code that was never executed.
STAFF_USERNAME = "staff"
TENANT_A_STAFF_PASSWORD = "tenantA-staff-789"
TENANT_B_STAFF_PASSWORD = "tenantB-staff-012"

# Master data (fixed ids). a* = tenant A, b* = tenant B.
UOM_A_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a1")
CATEGORY_A_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a2")
PRODUCT_A_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a3")
SELLER_A_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a4")

UOM_B_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b1")
CATEGORY_B_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b2")
PRODUCT_B_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b3")
SELLER_B_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b4")

# Extra sellers (Phase 2c-6) so the picker has a real list to search and the
# seller's GRADE can be seen selecting a different price tier per bill.
#
# The grades are spread across A-D deliberately, and SELLER_A5 has NO GRADE on
# purpose: that is the resolvable-refusal path (424 seller_grade_unset), and it
# has to be reachable from the yard app to be testable at all. SELLER_A_ID keeps
# grade B, because prove_master_data_gate.py borrows and restores exactly that.
SELLER_A2_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a7")
SELLER_A3_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a8")
SELLER_A4_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a9")
SELLER_A5_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000aa")
SELLER_B2_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b7")

# Extra products (Phase 2c-2) so the mobile form has a real list to pick from,
# and price tiers so unit_price has something to default from.
PRODUCT_A2_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a5")
PRODUCT_A3_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a6")
PRODUCT_B2_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b5")
PRODUCT_B3_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b6")

# The seller's grade picks which product_prices tier applies (SRS 1.6). Tenant A
# is deliberately grade B, not A, so the app is seen choosing a tier rather than
# just taking the first one.
#
# FE-STEEL grade B is exactly 15.00 on purpose: with gross 10.005 / tare 0.002
# the amount lands on 150.045, the HALF_UP vs HALF_EVEN tie. The rounding edge
# is therefore reachable with the DEFAULT price, no override needed.
PRODUCTS_A = [
    {"id": PRODUCT_A_ID, "code": "FE-STEEL", "name": "Steel scrap",
     "prices": {"A": "15.50", "B": "15.00", "C": "14.50", "D": "14.00"}},
    {"id": PRODUCT_A2_ID, "code": "AL-CAN", "name": "อลูมิเนียมกระป๋อง",
     "prices": {"A": "45.00", "B": "44.00", "C": "43.00", "D": "42.00"}},
    {"id": PRODUCT_A3_ID, "code": "CU-WIRE", "name": "ทองแดงสายไฟ",
     "prices": {"A": "215.00", "B": "212.50", "C": "210.00", "D": "205.00"}},
]
PRODUCTS_B = [
    {"id": PRODUCT_B_ID, "code": "FE-STEEL", "name": "Steel scrap",
     "prices": {"A": "9.50", "B": "9.00", "C": "8.50", "D": "8.00"}},
    {"id": PRODUCT_B2_ID, "code": "PET-BOTTLE", "name": "ขวดพลาสติกใส",
     "prices": {"A": "7.00", "B": "6.50", "C": "6.00", "D": "5.50"}},
    {"id": PRODUCT_B3_ID, "code": "PAPER-KRAFT", "name": "กระดาษลูกฟูก",
     "prices": {"A": "3.20", "B": "3.00", "C": "2.80", "D": "2.60"}},
]

# code is UNIQUE per tenant (uq_sellers_tenant_code), so the same S00n codes
# appear in both tenants — which is also what makes the isolation proof honest.
SELLERS_A = [
    {"id": SELLER_A_ID, "code": "S001", "name": "สมชาย ใจดี", "phone": "0800000001", "grade": "B"},
    {"id": SELLER_A2_ID, "code": "S002", "name": "ร้านรับซื้อ พี่แดง", "phone": "0800000002", "grade": "A"},
    {"id": SELLER_A3_ID, "code": "S003", "name": "สมหญิง รุ่งเรือง", "phone": "0800000003", "grade": "C"},
    {"id": SELLER_A4_ID, "code": "S004", "name": "โรงงาน ทองไทย", "phone": "0800000004", "grade": "D"},
    # No grade: the 424 seller_grade_unset path, reachable from the app.
    {"id": SELLER_A5_ID, "code": "S005", "name": "ลูกค้าใหม่ ยังไม่จัดเกรด", "phone": None, "grade": None},
]
SELLERS_B = [
    {"id": SELLER_B_ID, "code": "S001", "name": "Seller of Shop B", "phone": "0800000000", "grade": "A"},
    {"id": SELLER_B2_ID, "code": "S002", "name": "ลูกค้าร้าน B", "phone": None, "grade": "C"},
]

SEED = [
    {
        "tenant_id": TENANT_A_ID,
        "tenant_name": "Shop A",
        "users": [
            {"username": ADMIN_USERNAME, "full_name": "Admin of Shop A",
             "role": "admin", "password": TENANT_A_PASSWORD},
            {"username": STAFF_USERNAME, "full_name": "Yard staff of Shop A",
             "role": "staff", "password": TENANT_A_STAFF_PASSWORD},
        ],
        "uom_id": UOM_A_ID,
        "category_id": CATEGORY_A_ID,
        "product_id": PRODUCT_A_ID,
        "products": PRODUCTS_A,
        "sellers": SELLERS_A,
    },
    {
        "tenant_id": TENANT_B_ID,
        "tenant_name": "Shop B",
        "users": [
            {"username": ADMIN_USERNAME, "full_name": "Admin of Shop B",
             "role": "admin", "password": TENANT_B_PASSWORD},
            {"username": STAFF_USERNAME, "full_name": "Yard staff of Shop B",
             "role": "staff", "password": TENANT_B_STAFF_PASSWORD},
        ],
        "uom_id": UOM_B_ID,
        "category_id": CATEGORY_B_ID,
        "product_id": PRODUCT_B_ID,
        "products": PRODUCTS_B,
        "sellers": SELLERS_B,
    },
]
