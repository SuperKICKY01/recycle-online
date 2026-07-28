"""Prove the role gate and the master-data write API over real HTTP.

    python scripts/prove_master_write.py     (from the server/ directory)

Two things, and the second rests on the first.

  ROLE   users.role existed since migration 0001 and no code read it, so every
         device was effectively admin: any yard phone could void any bill. Now
         `admin` is required for void and for every master-data write, and the
         refusal is a 403 that CANNOT be confused with the rejection species the
         sync engine already knows (422 permanent, 424 resolvable) or with 401
         (identity) or 404 (no such row here).

  WRITE  A shop can enter its own uoms, categories, products, price tiers and
         sellers. Admin only, tenant-scoped through the existing RLS path, with
         no hand-written WHERE tenant_id anywhere in app/master.py.

WHAT THIS DOES NOT PROVE, because it cannot be built yet: deactivation. Neither
sellers, products, uoms nor product_categories has an `is_active` column
(migrations 0001-0003, checked against the live database), so "deactivate a
product referenced by a bill and the bill stays intact" has no endpoint to
exercise. What IS proven instead is the half of that requirement that stands
today: there is no delete route at all (D1), so nothing can remove a row a bill
depends on.

STATE. Everything this script creates is per-run (codes carry a RUN suffix) and
is deleted in the finally block. The two things it BORROWS from the seed — the
FE-STEEL grade-B price and the admin's role — are saved, mutated and restored,
and the restore is verified. The bills it creates are left in place: hard rule 5,
no hard deletes on transactions. Idempotency keys, bill ids and every code are
per-run, and no assertion counts rows, so it passes twice in a row against a live
database (lessons/proof-must-run-twice.md).
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    SELLER_A_ID,
    STAFF_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_A_STAFF_PASSWORD,
    TENANT_B_ID,
    TENANT_B_PASSWORD,
)

load_dotenv()

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8099")
RUN = uuid.uuid4().hex[:8]
SEEDED_GRADE = "B"  # seller A's seeded grade
VOID_REASON = "proof fixture: prove_master_write.py, not a real correction"

_failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK  ' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        _failures.append(label)


def header(text: str) -> None:
    print(f"\n=== {text} ===")


def detail_of(response: httpx.Response) -> object:
    try:
        return response.json().get("detail")
    except Exception:
        return None


def kind_of(response: httpx.Response) -> str | None:
    """The machine-readable `kind` a refusal names itself with, if any.

    A 422 from pydantic carries a LIST, and bills.py's own 422s carry a bare
    string; neither has a kind, and that is itself a distinguishing fact.
    """
    d = detail_of(response)
    return d.get("kind") if isinstance(d, dict) else None


def login(client: httpx.Client, tenant_id, username: str, password: str) -> dict[str, str]:
    r = client.post(
        f"{BASE}/auth/login",
        json={"tenant_id": str(tenant_id), "username": username, "password": password},
    )
    r.raise_for_status()
    return {"authorization": f"Bearer {r.json()['access_token']}"}


def bill_body(bill_id: str, key: str, seller_id, product_id, unit_price: str) -> dict:
    return {
        "id": bill_id,
        "seller_id": str(seller_id),
        "vehicle_no": f"MW-{RUN}",
        "device_created_at": "2026-07-28T08:00:00+00:00",
        "idempotency_key": key,
        "items": [
            {
                "id": str(uuid.uuid4()),
                "product_id": str(product_id),
                "line_no": 1,
                "gross_weight": "10.000",
                "tare_weight": "0.000",
                "net_weight": "10.000",
                "unit_price": unit_price,
            }
        ],
    }


async def main() -> int:  # noqa: C901 — one linear narrative, deliberately flat
    url = os.environ["APP_DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    db = await asyncpg.connect(url)
    await db.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))

    saved_price = await db.fetchval(
        "SELECT price FROM product_prices WHERE product_id = $1 AND grade = $2",
        PRODUCT_A_ID, SEEDED_GRADE,
    )
    if saved_price is None:
        print("SETUP FAILED: seeded FE-STEEL grade B price not found. Run seed_dev.py.")
        await db.close()
        return 1

    client = httpx.Client(timeout=20.0)
    created: dict[str, str] = {}
    demoted = False

    try:
        try:
            admin = login(client, TENANT_A_ID, ADMIN_USERNAME, TENANT_A_PASSWORD)
            staff = login(client, TENANT_A_ID, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
            admin_b = login(client, TENANT_B_ID, ADMIN_USERNAME, TENANT_B_PASSWORD)
        except httpx.HTTPStatusError as e:
            print(f"SETUP FAILED: login returned {e.response.status_code}."
                  " Run seed_dev.py — the staff user is new in this phase.")
            await db.close()
            client.close()
            return 1

        # ------------------------------------------------------------------ A1
        header("A1: the role the SERVER resolved, per token")
        who_admin = client.get(f"{BASE}/whoami", headers=admin).json()
        who_staff = client.get(f"{BASE}/whoami", headers=staff).json()
        check("the admin token resolves to role=admin", who_admin.get("role") == "admin",
              f"role={who_admin.get('role')}")
        check("the staff token resolves to role=staff", who_staff.get("role") == "staff",
              f"role={who_staff.get('role')}")
        check("both are the same tenant — this is about ROLE, not tenancy",
              who_admin.get("tenant_id") == who_staff.get("tenant_id") == str(TENANT_A_ID),
              f"{who_admin.get('tenant_id')} / {who_staff.get('tenant_id')}")
        check("staff keeps its reads: GET /products answers 200",
              client.get(f"{BASE}/products", headers=staff).status_code == 200)
        check("and staff can still CREATE a bill — the yard is not locked out",
              client.post(
                  f"{BASE}/bills", headers=staff,
                  json=bill_body(str(uuid.uuid4()), f"mw-{RUN}-staff",
                                 SELLER_A_ID, PRODUCT_A_ID, "15.00"),
              ).status_code == 201)

        # ------------------------------------------------------------------ W1
        header("W1: an admin builds a shop's master data from nothing")
        r = client.post(f"{BASE}/uoms", headers=admin,
                        json={"code": f"KG-{RUN}", "name": "กิโลกรัม"})
        check("POST /uoms -> 201", r.status_code == 201, f"status={r.status_code}")
        created["uom"] = r.json().get("id", "")

        r = client.post(f"{BASE}/product-categories", headers=admin,
                        json={"code": f"CAT-{RUN}", "name": "โลหะ"})
        check("POST /product-categories -> 201", r.status_code == 201, f"status={r.status_code}")
        created["category"] = r.json().get("id", "")

        r = client.post(f"{BASE}/products", headers=admin, json={
            "code": f"PROD-{RUN}", "name": "ทองเหลือง",
            "category_id": created["category"], "uom_id": created["uom"],
        })
        check("POST /products -> 201", r.status_code == 201, f"status={r.status_code}")
        new_product = r.json()
        created["product"] = new_product.get("id", "")
        check("a brand-new product has NO price tiers — never an invented one",
              new_product.get("prices") == {}, f"prices={new_product.get('prices')}")

        r = client.post(f"{BASE}/sellers", headers=admin, json={
            "code": f"SELL-{RUN}", "name": "ผู้ขายทดสอบ", "phone": "0812345678", "grade": "A",
        })
        check("POST /sellers -> 201", r.status_code == 201, f"status={r.status_code}")
        created["seller"] = r.json().get("id", "")

        r = client.put(f"{BASE}/products/{created['product']}/prices/A",
                       headers=admin, json={"price": "88.25"})
        check("PUT a grade-A price tier -> 200", r.status_code == 200, f"status={r.status_code}")
        check("and the tier comes back on the product",
              r.json().get("prices", {}).get("A") == "88.25",
              f"prices={r.json().get('prices')}")

        # ------------------------------------------------------------------ W2
        header("W2: the change is visible to the READ endpoints")
        uoms = client.get(f"{BASE}/uoms", headers=staff).json()["uoms"]
        cats = client.get(f"{BASE}/product-categories", headers=staff).json()["product_categories"]
        prods = client.get(f"{BASE}/products", headers=staff).json()["products"]
        sells = client.get(f"{BASE}/sellers", headers=staff).json()["sellers"]
        check("GET /uoms contains the new uom",
              any(u["code"] == f"KG-{RUN}" for u in uoms))
        check("GET /product-categories contains the new category",
              any(c["code"] == f"CAT-{RUN}" for c in cats))
        check("GET /products contains the new product, priced",
              any(p["code"] == f"PROD-{RUN}" and p["prices"].get("A") == "88.25" for p in prods))
        check("GET /sellers contains the new seller with its grade",
              any(s["code"] == f"SELL-{RUN}" and s["grade"] == "A" for s in sells))
        check("money crossed the wire as a STRING, never a JSON float",
              all(isinstance(v, str) for p in prods for v in p["prices"].values()))

        # ------------------------------------------------------------------ W3
        header("W3: PATCH changes what it names and nothing else")
        r = client.patch(f"{BASE}/sellers/{created['seller']}", headers=admin,
                         json={"name": "ผู้ขายทดสอบ แก้ไขแล้ว"})
        check("PATCH /sellers -> 200", r.status_code == 200, f"status={r.status_code}")
        patched = r.json()
        check("the name changed", patched.get("name") == "ผู้ขายทดสอบ แก้ไขแล้ว",
              f"name={patched.get('name')}")
        check("the code, phone and grade were left alone",
              patched.get("code") == f"SELL-{RUN}" and patched.get("phone") == "0812345678"
              and patched.get("grade") == "A", str(patched))

        r = client.patch(f"{BASE}/sellers/{created['seller']}", headers=admin,
                         json={"grade": None})
        check("an EXPLICIT null clears a nullable column (grade)",
              r.status_code == 200 and r.json().get("grade") is None,
              f"status={r.status_code} grade={r.json().get('grade')}")
        client.patch(f"{BASE}/sellers/{created['seller']}", headers=admin, json={"grade": "A"})

        r = client.patch(f"{BASE}/uoms/{created['uom']}", headers=admin, json={"name": None})
        check("but a NOT NULL column refuses to be cleared — 422, not a silent no-op",
              r.status_code == 422 and kind_of(r) == "invalid_request",
              f"status={r.status_code} kind={kind_of(r)}")

        r = client.patch(f"{BASE}/uoms/{created['uom']}", headers=admin, json={})
        check("an empty PATCH is refused (422), never a SQL syntax error 500",
              r.status_code == 422, f"status={r.status_code}")

        # ------------------------------------------------------------------ H1
        header("H1: a historical bill, priced from the list as it stands now")
        keep_id = str(uuid.uuid4())
        r = client.post(f"{BASE}/bills", headers=admin,
                        json=bill_body(keep_id, f"mw-{RUN}-keep",
                                       SELLER_A_ID, PRODUCT_A_ID, "15.00"))
        check("the bill was created", r.status_code == 201, f"status={r.status_code}")
        historical_list_price = r.json()["items"][0]["list_price"]
        check("its list_price was stamped from the CURRENT seeded tier",
              historical_list_price == str(saved_price),
              f"list_price={historical_list_price} seeded={saved_price}")

        # ------------------------------------------------------------------ R1
        header("R1: a staff token is refused on EVERY write endpoint, and on void")
        bogus = str(uuid.uuid4())
        refusals = [
            ("POST",  "/uoms", {"code": f"NOPE-U-{RUN}", "name": "x"}),
            ("PATCH", f"/uoms/{created['uom']}", {"name": "staff was here"}),
            ("POST",  "/product-categories", {"code": f"NOPE-C-{RUN}", "name": "x"}),
            ("PATCH", f"/product-categories/{created['category']}", {"name": "staff was here"}),
            ("POST",  "/products", {"code": f"NOPE-P-{RUN}", "name": "x",
                                    "category_id": created["category"], "uom_id": created["uom"]}),
            ("PATCH", f"/products/{created['product']}", {"name": "staff was here"}),
            ("PUT",   f"/products/{created['product']}/prices/A", {"price": "0.01"}),
            ("POST",  "/sellers", {"code": f"NOPE-S-{RUN}", "name": "x"}),
            ("PATCH", f"/sellers/{created['seller']}", {"name": "staff was here"}),
            ("POST",  f"/bills/{keep_id}/void", {"reason": "staff should not be able to do this"}),
        ]
        for method, path, body in refusals:
            resp = client.request(method, f"{BASE}{path}", headers=staff, json=body)
            d = detail_of(resp)
            named = isinstance(d, dict) and d.get("kind") == "forbidden" \
                and d.get("code") == "admin_required" and d.get("actual_role") == "staff"
            check(f"{method} {path} -> 403, naming its kind",
                  resp.status_code == 403 and named,
                  f"status={resp.status_code} detail={d!r}")

        header("R1b: and NOTHING the staff token asked for actually happened")
        uoms = client.get(f"{BASE}/uoms", headers=admin).json()["uoms"]
        prods = client.get(f"{BASE}/products", headers=admin).json()["products"]
        sells = client.get(f"{BASE}/sellers", headers=admin).json()["sellers"]
        cats = client.get(f"{BASE}/product-categories", headers=admin).json()["product_categories"]
        check("no row was created by any refused POST",
              not any(u["code"] == f"NOPE-U-{RUN}" for u in uoms)
              and not any(c["code"] == f"NOPE-C-{RUN}" for c in cats)
              and not any(p["code"] == f"NOPE-P-{RUN}" for p in prods)
              and not any(s["code"] == f"NOPE-S-{RUN}" for s in sells))
        check("no row was renamed by any refused PATCH",
              not any(x["name"] == "staff was here"
                      for x in (*uoms, *cats, *prods, *sells)))
        check("the price tier is untouched by the refused PUT",
              next(p for p in prods if p["id"] == created["product"])["prices"].get("A") == "88.25")
        bill_now = client.get(f"{BASE}/bills/{keep_id}", headers=admin).json()
        check("and the bill staff tried to void is still ACTIVE",
              bill_now.get("status") == "active" and bill_now.get("voided_at") is None,
              f"status={bill_now.get('status')}")

        header("R1c: the role check runs BEFORE any lookup — 403 even for an id that does not exist")
        resp = client.patch(f"{BASE}/sellers/{bogus}", headers=staff, json={"name": "x"})
        check("staff PATCHing a nonexistent seller is 403, not 404",
              resp.status_code == 403, f"status={resp.status_code}")

        header("R1d: an ADMIN can do the thing staff could not — the gate is not blocking everyone")
        void_id = str(uuid.uuid4())
        client.post(f"{BASE}/bills", headers=admin,
                    json=bill_body(void_id, f"mw-{RUN}-void", SELLER_A_ID, PRODUCT_A_ID, "15.00"))
        resp = client.post(f"{BASE}/bills/{void_id}/void", headers=admin,
                           json={"reason": VOID_REASON})
        check("admin void -> 200 and the bill is voided",
              resp.status_code == 200 and resp.json().get("status") == "voided",
              f"status={resp.status_code}")

        # ------------------------------------------------------------------ C1
        header("C1: a 403 cannot be mistaken for anything else the server says")
        # Four real responses, collected here rather than described.
        r403 = client.post(f"{BASE}/sellers", headers=staff,
                           json={"code": f"X-{RUN}", "name": "x"})
        r401 = client.post(f"{BASE}/sellers",
                           headers={"authorization": "Bearer not-a-real-token"},
                           json={"code": f"X-{RUN}", "name": "x"})
        r404 = client.patch(f"{BASE}/sellers/{bogus}", headers=admin, json={"name": "x"})
        malformed = bill_body(str(uuid.uuid4()), f"mw-{RUN}-bad",
                              SELLER_A_ID, PRODUCT_A_ID, "15.00")
        malformed["items"][0]["gross_weight"] = "1.0005"   # 4dp: can never be valid
        malformed["items"][0]["net_weight"] = "1.0005"
        r422 = client.post(f"{BASE}/bills", headers=admin, json=malformed)
        # The run's own product has no grade-B tier, so a grade-B seller against
        # it is the RESOLVABLE case — no seeded state borrowed to produce it.
        r424 = client.post(f"{BASE}/bills", headers=admin,
                           json=bill_body(str(uuid.uuid4()), f"mw-{RUN}-424",
                                          SELLER_A_ID, created["product"], "1.00"))

        observed = {
            "403 forbidden (wrong role)":       (r403.status_code, kind_of(r403)),
            "401 identity (no valid token)":    (r401.status_code, kind_of(r401)),
            "404 not found (no such row here)": (r404.status_code, kind_of(r404)),
            "422 permanent (malformed money)":  (r422.status_code, kind_of(r422)),
            "424 resolvable (no price tier)":   (r424.status_code, kind_of(r424)),
        }
        for label, (code, kind) in observed.items():
            print(f"    {label:36s} -> status={code} kind={kind!r}")

        check("the 403 is a 403", observed["403 forbidden (wrong role)"][0] == 403)
        check("the 424 really is the resolvable class",
              observed["424 resolvable (no price tier)"] == (424, "master_data_missing"))
        check("the 422 really is the permanent class",
              observed["422 permanent (malformed money)"][0] == 422)
        statuses = [code for code, _ in observed.values()]
        check("all five statuses are DISTINCT — a client reading only the status can tell them apart",
              len(set(statuses)) == len(statuses), f"statuses={statuses}")
        check("403's kind 'forbidden' is not 424's 'master_data_missing'",
              kind_of(r403) == "forbidden" and kind_of(r424) == "master_data_missing")
        check("nor is it whatever the permanent 422 carries (a list or a bare string, not a kind)",
              kind_of(r422) != "forbidden",
              f"422 detail type={type(detail_of(r422)).__name__}")
        check("so the two axes agree: neither status nor kind can conflate 403 with 422 or 424",
              len({observed[k] for k in observed}) == len(observed))

        # ------------------------------------------------------------------ T1
        header("T1: tenant B's admin cannot touch tenant A's rows — RLS holds for WRITES")
        r = client.patch(f"{BASE}/sellers/{created['seller']}", headers=admin_b,
                         json={"name": "tenant B was here"})
        check("B's admin PATCHing A's seller -> 404 (invisible, not forbidden)",
              r.status_code == 404, f"status={r.status_code}")
        r = client.put(f"{BASE}/products/{created['product']}/prices/A", headers=admin_b,
                       json={"price": "0.01"})
        check("B's admin repricing A's product -> 404", r.status_code == 404,
              f"status={r.status_code}")
        r = client.patch(f"{BASE}/products/{created['product']}", headers=admin_b,
                         json={"name": "tenant B was here"})
        check("B's admin renaming A's product -> 404", r.status_code == 404,
              f"status={r.status_code}")

        a_seller = next(s for s in client.get(f"{BASE}/sellers", headers=admin).json()["sellers"]
                        if s["id"] == created["seller"])
        a_product = next(p for p in client.get(f"{BASE}/products", headers=admin).json()["products"]
                         if p["id"] == created["product"])
        check("A's seller name survived untouched",
              a_seller["name"] == "ผู้ขายทดสอบ แก้ไขแล้ว", f"name={a_seller['name']}")
        check("A's product name and price survived untouched",
              a_product["name"] == "ทองเหลือง" and a_product["prices"].get("A") == "88.25",
              str(a_product))

        header("T1b: B's own write lands in B — and A cannot see it")
        # The SAME code as A's seller. Codes are unique PER TENANT, so a 409 here
        # would mean the write had gone to A's rows.
        r = client.post(f"{BASE}/sellers", headers=admin_b,
                        json={"code": f"SELL-{RUN}", "name": "ผู้ขายของร้าน B", "grade": "C"})
        check("B creates a seller with the SAME code as A's -> 201, not 409",
              r.status_code == 201, f"status={r.status_code}")
        created["seller_b"] = r.json().get("id", "")
        b_sellers = client.get(f"{BASE}/sellers", headers=admin_b).json()["sellers"]
        a_sellers = client.get(f"{BASE}/sellers", headers=admin).json()["sellers"]
        check("B's list contains B's seller", any(s["id"] == created["seller_b"] for s in b_sellers))
        check("A's list does NOT contain B's seller",
              not any(s["id"] == created["seller_b"] for s in a_sellers))
        check("B's list does NOT contain A's seller",
              not any(s["id"] == created["seller"] for s in b_sellers))

        # ------------------------------------------------------------------ P1
        header("P1: a price tier change does not reach back into a historical bill")
        new_price = "77.77"
        check("the new price is genuinely different from the old one",
              new_price != str(saved_price), f"old={saved_price} new={new_price}")
        r = client.put(f"{BASE}/products/{PRODUCT_A_ID}/prices/{SEEDED_GRADE}",
                       headers=admin, json={"price": new_price})
        check("the admin's reprice landed -> 200", r.status_code == 200, f"status={r.status_code}")
        check("and the READ endpoint shows the new price — so this is not a vacuous test",
              r.json()["prices"].get(SEEDED_GRADE) == new_price,
              f"prices={r.json().get('prices')}")

        after = client.get(f"{BASE}/bills/{keep_id}", headers=admin).json()
        check("the historical bill's list_price is UNCHANGED",
              after["items"][0]["list_price"] == historical_list_price,
              f"now={after['items'][0]['list_price']} was={historical_list_price}")
        check("its unit_price and amount are unchanged too",
              after["items"][0]["unit_price"] == "15.00"
              and after["items"][0]["amount"] == "150.00",
              f"unit={after['items'][0]['unit_price']} amount={after['items'][0]['amount']}")
        check("and the total on the header did not move",
              after["total_amount"] == "150.00", f"total={after['total_amount']}")

        header("P1b: a bill written AFTER the change takes the NEW price — the change is real")
        r = client.post(f"{BASE}/bills", headers=admin,
                        json=bill_body(str(uuid.uuid4()), f"mw-{RUN}-after",
                                       SELLER_A_ID, PRODUCT_A_ID, "15.00"))
        check("the new bill's list_price is the new tier",
              r.status_code == 201 and r.json()["items"][0]["list_price"] == new_price,
              f"status={r.status_code} list_price={r.json().get('items', [{}])[0].get('list_price')}")

        # ------------------------------------------------------------------ E1
        header("E1: the edges a NUMERIC column would swallow, and a duplicate key")
        r = client.post(f"{BASE}/sellers", headers=admin,
                        json={"code": f"SELL-{RUN}", "name": "ซ้ำ"})
        check("a duplicate code is a named 409, never an unhandled 500",
              r.status_code == 409 and kind_of(r) == "conflict"
              and (detail_of(r) or {}).get("code") == "duplicate_code",
              f"status={r.status_code} detail={detail_of(r)!r}")

        r = client.put(f"{BASE}/products/{created['product']}/prices/A",
                       headers=admin, json={"price": "1.005"})
        check("an over-scale price is REFUSED (422), not silently rounded to 1.01",
              r.status_code == 422, f"status={r.status_code}")
        r = client.put(f"{BASE}/products/{created['product']}/prices/A",
                       headers=admin, json={"price": "-1.00"})
        check("a negative price is refused (422) at the edge, not by a CHECK 500",
              r.status_code == 422, f"status={r.status_code}")
        r = client.put(f"{BASE}/products/{created['product']}/prices/Z",
                       headers=admin, json={"price": "1.00"})
        check("a grade outside A-D is refused (422) at the edge",
              r.status_code == 422, f"status={r.status_code}")
        still = next(p for p in client.get(f"{BASE}/products", headers=admin).json()["products"]
                     if p["id"] == created["product"])
        check("after all four refusals the stored tier is still exactly 88.25",
              still["prices"].get("A") == "88.25", f"prices={still['prices']}")

        r = client.post(f"{BASE}/products", headers=admin, json={
            "code": f"BADREF-{RUN}", "name": "x",
            "category_id": str(uuid.uuid4()), "uom_id": created["uom"],
        })
        check("a product referencing a category that is not in this tenant -> 422, not a FK 500",
              r.status_code == 422 and (detail_of(r) or {}).get("code") == "category_not_found",
              f"status={r.status_code} detail={detail_of(r)!r}")

        # ------------------------------------------------------------------ D1
        header("D1: there is NO delete route — a bill's references cannot be removed")
        for path in (f"/sellers/{created['seller']}", f"/products/{created['product']}",
                     f"/uoms/{created['uom']}", f"/product-categories/{created['category']}"):
            resp = client.request("DELETE", f"{BASE}{path}", headers=admin)
            check(f"DELETE {path} is not routed (405)", resp.status_code == 405,
                  f"status={resp.status_code}")
        print("    (deactivate is the intended retirement path and needs a migration —"
              " no is_active column exists. See PROJECT_STATUS.md.)")

        # ------------------------------------------------------------------ X1
        header("X1: the DATABASE decides the role, not the token — a demotion takes effect at once")
        r = client.post(f"{BASE}/uoms", headers=admin, json={"code": f"PRE-{RUN}", "name": "x"})
        check("before the demotion this admin token can write", r.status_code == 201,
              f"status={r.status_code}")
        created["uom_pre"] = r.json().get("id", "")

        await db.execute("UPDATE users SET role = 'staff' WHERE username = $1", ADMIN_USERNAME)
        demoted = True

        # The SAME token, unchanged and unexpired — it still claims role=admin.
        r = client.post(f"{BASE}/uoms", headers=admin, json={"code": f"POST-{RUN}", "name": "x"})
        check("the SAME token is now refused 403 — the claim did not outlive the row",
              r.status_code == 403, f"status={r.status_code}")
        who = client.get(f"{BASE}/whoami", headers=admin).json()
        check("and /whoami reports the role the server RESOLVED, not the one claimed",
              who.get("role") == "staff", f"role={who.get('role')}")

        await db.execute("UPDATE users SET role = 'admin' WHERE username = $1", ADMIN_USERNAME)
        demoted = False
        r = client.post(f"{BASE}/uoms", headers=admin, json={"code": f"BACK-{RUN}", "name": "x"})
        check("promoted back, the same token works again — no re-login needed",
              r.status_code == 201, f"status={r.status_code}")
        created["uom_back"] = r.json().get("id", "")

    finally:
        # ---- restore exactly what was borrowed, whatever happened above ----
        if demoted:
            await db.execute("UPDATE users SET role = 'admin' WHERE username = $1",
                             ADMIN_USERNAME)
        await db.execute(
            "INSERT INTO product_prices (tenant_id, product_id, grade, price)"
            " VALUES ($1, $2, $3, $4)"
            " ON CONFLICT (tenant_id, product_id, grade) DO UPDATE SET price = EXCLUDED.price",
            TENANT_A_ID, PRODUCT_A_ID, SEEDED_GRADE, Decimal(saved_price),
        )

        # ---- remove this run's own fixtures (master data only, never bills) ----
        # Order matters: prices reference products, products reference category
        # and uom. Nothing here is referenced by a bill — the only bills created
        # point at SEEDED rows, and the one aimed at this run's product was
        # refused 424, so no row was ever written for it.
        for key in ("product", "product_pre"):
            if created.get(key):
                await db.execute("DELETE FROM product_prices WHERE product_id = $1",
                                 uuid.UUID(created[key]))
        for table, key in (("products", "product"), ("sellers", "seller"),
                           ("product_categories", "category"), ("uoms", "uom"),
                           ("uoms", "uom_pre"), ("uoms", "uom_back")):
            if created.get(key):
                await db.execute(f"DELETE FROM {table} WHERE id = $1", uuid.UUID(created[key]))
        if created.get("seller_b"):
            await db.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_B_ID))
            await db.execute("DELETE FROM sellers WHERE id = $1", uuid.UUID(created["seller_b"]))
            await db.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))

        restored_price = await db.fetchval(
            "SELECT price FROM product_prices WHERE product_id = $1 AND grade = $2",
            PRODUCT_A_ID, SEEDED_GRADE,
        )
        restored_role = await db.fetchval(
            "SELECT role FROM users WHERE username = $1", ADMIN_USERNAME
        )
        leftovers = await db.fetchval(
            "SELECT count(*) FROM products WHERE code LIKE $1", f"%-{RUN}"
        )
        print()
        print(f"  restored: FE-STEEL/{SEEDED_GRADE} price={restored_price}"
              f" admin role={restored_role}; run fixtures left behind={leftovers}")
        if restored_price != saved_price:
            _failures.append("the borrowed price was not restored")
        if restored_role != "admin":
            _failures.append("the borrowed admin role was not restored")
        if leftovers:
            _failures.append("this run's product fixtures were not cleaned up")

        client.close()
        await db.close()

    print()
    if _failures:
        print(f"FAILED — {len(_failures)} check(s): {_failures}")
        return 1
    print("  ALL CASES PASSED — writes are admin-only, tenant-scoped, and history is immutable.")
    return 0


if __name__ == "__main__":
    code = asyncio.run(main())
    print(f"MASTERWRITE_EXIT={code}")
    sys.exit(code)
