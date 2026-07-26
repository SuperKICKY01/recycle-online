"""Prove the Phase 2c-2 read endpoints over real HTTP.

The claim under test is not "it returns products" — it is that a token for one
tenant can never see another tenant's master data, and that money crosses the
wire as strings.

    python scripts/prove_master.py        (server must be running)
"""
from __future__ import annotations

import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402

from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    PRODUCT_B_ID,
    SELLER_A_ID,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_B_ID,
    TENANT_B_PASSWORD,
)

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")

failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK  ' if ok else 'FAIL'}] {label}{' — ' + detail if detail else ''}")
    if not ok:
        failures.append(label)


async def login(client: httpx.AsyncClient, tenant_id, password: str) -> str:
    r = await client.post(
        f"{BASE}/auth/login",
        json={"tenant_id": str(tenant_id), "username": ADMIN_USERNAME, "password": password},
    )
    r.raise_for_status()
    return r.json()["access_token"]


async def main() -> int:
    async with httpx.AsyncClient(timeout=15.0) as client:
        print("=== P1: products are scoped to the token's tenant ===")
        tok_a = await login(client, TENANT_A_ID, TENANT_A_PASSWORD)
        tok_b = await login(client, TENANT_B_ID, TENANT_B_PASSWORD)

        ra = await client.get(f"{BASE}/products", headers={"authorization": f"Bearer {tok_a}"})
        rb = await client.get(f"{BASE}/products", headers={"authorization": f"Bearer {tok_b}"})
        pa = ra.json()["products"]
        pb = rb.json()["products"]
        ids_a = {p["id"] for p in pa}
        ids_b = {p["id"] for p in pb}

        print(f"  tenant A sees: {[p['code'] for p in pa]}")
        print(f"  tenant B sees: {[p['code'] for p in pb]}")
        check("tenant A gets its own 3 products", len(pa) == 3, f"n={len(pa)}")
        check("tenant B gets its own 3 products", len(pb) == 3, f"n={len(pb)}")
        check("the two tenants share NO product id", ids_a.isdisjoint(ids_b),
              f"overlap={ids_a & ids_b}")
        check("tenant A's seeded product is visible to A", str(PRODUCT_A_ID) in ids_a)
        check("tenant B's product is INVISIBLE to A", str(PRODUCT_B_ID) not in ids_a)

        print("\n=== P2: money crosses the wire as strings, never floats ===")
        raw = ra.text
        steel = next(p for p in pa if p["code"] == "FE-STEEL")
        print(f"  FE-STEEL prices: {json.dumps(steel['prices'], ensure_ascii=False)}")
        check("every price is a JSON string",
              all(isinstance(v, str) for p in pa for v in p["prices"].values()))
        check('raw JSON contains "15.00" quoted, not 15.0 bare', '"15.00"' in raw,
              "a float would have serialised as 15.0")
        check("all four grade tiers present", sorted(steel["prices"]) == ["A", "B", "C", "D"],
              str(sorted(steel["prices"])))
        check("uom travels with the product", steel["uom_code"] == "KG", steel["uom_code"])

        print("\n=== P3: sellers are scoped too, and carry the grade ===")
        sa = (await client.get(f"{BASE}/sellers",
                               headers={"authorization": f"Bearer {tok_a}"})).json()["sellers"]
        sb = (await client.get(f"{BASE}/sellers",
                               headers={"authorization": f"Bearer {tok_b}"})).json()["sellers"]
        # Tenant A now has SEVERAL sellers (Phase 2c-6 needs a list to pick from),
        # so the isolation claim is stated as a SET relation rather than a count:
        # every id tenant B can see must be invisible to tenant A, and vice
        # versa. Asserting len(sa) == 1 only ever tested the size of the seed.
        ids_a = {s["id"] for s in sa}
        ids_b = {s["id"] for s in sb}
        check("tenant A sees its own seller", str(SELLER_A_ID) in ids_a, f"n={len(sa)}")
        check("no seller is visible to BOTH tenants", ids_a.isdisjoint(ids_b),
              f"overlap={ids_a & ids_b}")
        by_id = {s["id"]: s for s in sa}
        check("seller S001 carries grade B (selects the price tier)",
              by_id[str(SELLER_A_ID)]["grade"] == "B",
              f"grade={by_id[str(SELLER_A_ID)]['grade']}")
        # A grade-less seller is a real, seeded state — not a data error. It is
        # the 424 seller_grade_unset path, and the mobile picker must show it.
        check("at least one seeded seller has NO grade, and the API says null",
              any(s["grade"] is None for s in sa),
              f"grades={sorted(str(s['grade']) for s in sa)}")
        check("tenant B's seller is a different row", sb[0]["id"] != sa[0]["id"])

        print("\n=== P4: no token, no data ===")
        anon = await client.get(f"{BASE}/products")
        check("GET /products without a token is 401", anon.status_code == 401,
              f"status={anon.status_code}")
        bad = await client.get(f"{BASE}/products",
                               headers={"authorization": "Bearer not-a-real-token"})
        check("GET /products with a garbage token is 401", bad.status_code == 401,
              f"status={bad.status_code}")

    print("")
    print("ALL MASTER-DATA CASES PASSED" if not failures else f"FAILED: {failures}")
    return 0 if not failures else 1


if __name__ == "__main__":
    code = asyncio.run(main())
    print(f"MASTER_EXIT={code}")
    sys.exit(code)
