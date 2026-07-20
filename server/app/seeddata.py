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

# Master data (fixed ids). a* = tenant A, b* = tenant B.
UOM_A_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a1")
CATEGORY_A_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a2")
PRODUCT_A_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a3")
SELLER_A_ID = uuid.UUID("aaaa0000-0000-0000-0000-0000000000a4")

UOM_B_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b1")
CATEGORY_B_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b2")
PRODUCT_B_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b3")
SELLER_B_ID = uuid.UUID("bbbb0000-0000-0000-0000-0000000000b4")

SEED = [
    {
        "tenant_id": TENANT_A_ID,
        "tenant_name": "Shop A",
        "username": ADMIN_USERNAME,
        "full_name": "Admin of Shop A",
        "password": TENANT_A_PASSWORD,
        "uom_id": UOM_A_ID,
        "category_id": CATEGORY_A_ID,
        "product_id": PRODUCT_A_ID,
        "seller_id": SELLER_A_ID,
    },
    {
        "tenant_id": TENANT_B_ID,
        "tenant_name": "Shop B",
        "username": ADMIN_USERNAME,
        "full_name": "Admin of Shop B",
        "password": TENANT_B_PASSWORD,
        "uom_id": UOM_B_ID,
        "category_id": CATEGORY_B_ID,
        "product_id": PRODUCT_B_ID,
        "seller_id": SELLER_B_ID,
    },
]
