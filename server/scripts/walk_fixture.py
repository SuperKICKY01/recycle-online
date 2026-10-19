"""Walk fixture: a realistic catalogue for a LANE WALK database, so the cart's category browse,
search and frequent-products row can be walked on the emulator (A3 cart milestone,
ADVISOR-DECIDED 2026-10-12, decision 2c).

    RECYCLE_LANE=a uv run python scripts/walk_fixture.py --database recycle_walk_a
                                                        (from the server/ directory)

WHAT IT WRITES, for Shop A only (seed tenant A): six product categories and 37 products with
realistic Thai scrap-yard names, each priced on the seed's four tiers A-D. With seed_dev.py's
three products that is 40. Every write is idempotent (ON CONFLICT on the per-tenant unique
codes) and audited as the system actor `system:walk_fixture`, the way seed_dev.py is.

AND 30 SELLERS (seller search C3) with obviously fake phones and ID numbers by the pattern stated
at SELLERS below, a usual-truck plate on about two in three, and two sharing one name.

WHAT IT DOES NOT WRITE: bills. The frequent-products row is derived from the bills the DEVICE
holds (mobile/src/cart/productPicker.ts), and the app never downloads bills from the server, so
server-side bills could not reach it; the walk's bills are made by saving real bills on the
emulator. Nothing is deleted, nothing is deactivated.

IT REFUSES unless the target is a lane walk or scratch database: RECYCLE_LANE must be set, and
the name must be `scratch_name("recycle_walk")` or a `…_scratch_<lane>` name from
server/scripts/lane.py — and never the database server/.env names (dev). The one lane-free name
it accepts is the owner's demo database `recycle_demo` (tools/owner/start_demo.cmd), by exact name. The target's URLs are
rebound BEFORE the app is imported (lessons/a-scratch-proof-imports-the-app-only-after-it-
rebinds-the-database.md), so the app's engine can only ever see the walk database. No
connection string is taken on the command line.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from decimal import Decimal

SERVER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER)
sys.path.insert(0, os.path.join(SERVER, "scripts"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(SERVER, ".env"))

from sqlalchemy.engine import make_url  # noqa: E402

from lane import lane_tag, scratch_name  # noqa: E402

URL_KEYS = ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL", "MIGRATION_DATABASE_URL")
DEMO_DATABASE = "recycle_demo"

# (code, Thai name). Six categories; codes are the per-tenant unique handle.
CATEGORIES = [
    ("WF-FE", "เหล็ก"),
    ("WF-AL", "อลูมิเนียม"),
    ("WF-CU", "ทองแดงและทองเหลือง"),
    ("WF-PAPER", "กระดาษ"),
    ("WF-PLASTIC", "พลาสติก"),
    ("WF-MISC", "เบ็ดเตล็ด"),
]

# (code, Thai name, category code, tier-A price). B/C/D step down from A.
PRODUCTS = [
    ("FE-HEAVY", "เหล็กหนา", "WF-FE", "12.50"),
    ("FE-THIN", "เหล็กบาง", "WF-FE", "10.00"),
    ("FE-CAST", "เหล็กหล่อ", "WF-FE", "11.50"),
    ("FE-REBAR", "เหล็กเส้น", "WF-FE", "12.00"),
    ("FE-SHEET", "เหล็กแผ่น", "WF-FE", "11.00"),
    ("FE-CAN", "กระป๋องเหล็ก", "WF-FE", "6.50"),
    ("FE-WIRE", "ลวดเหล็ก", "WF-FE", "9.00"),
    ("AL-SHEET", "อลูมิเนียมแผ่น", "WF-AL", "60.00"),
    ("AL-FRAME", "อลูมิเนียมวงกบ", "WF-AL", "65.00"),
    ("AL-WHEEL", "ล้ออลูมิเนียม", "WF-AL", "70.00"),
    ("AL-CAST", "อลูมิเนียมหล่อ", "WF-AL", "50.00"),
    ("AL-FOIL", "ฟอยล์อลูมิเนียม", "WF-AL", "25.00"),
    ("AL-RADIATOR", "หม้อน้ำอลูมิเนียม", "WF-AL", "55.00"),
    ("CU-BRIGHT", "ทองแดงช็อต", "WF-CU", "280.00"),
    ("CU-PIPE", "ท่อทองแดง", "WF-CU", "250.00"),
    ("CU-MOTOR", "ทองแดงมอเตอร์", "WF-CU", "230.00"),
    ("BR-HARD", "ทองเหลืองหนา", "WF-CU", "160.00"),
    ("BR-VALVE", "วาล์วทองเหลือง", "WF-CU", "140.00"),
    ("CU-CABLE", "สายไฟรวม", "WF-CU", "60.00"),
    ("PA-CARTON", "กระดาษลัง", "WF-PAPER", "3.50"),
    ("PA-WHITE", "กระดาษขาวดำ", "WF-PAPER", "6.00"),
    ("PA-NEWS", "หนังสือพิมพ์", "WF-PAPER", "5.00"),
    ("PA-MIXED", "กระดาษรวม", "WF-PAPER", "2.50"),
    ("PA-BOOK", "สมุดหนังสือ", "WF-PAPER", "4.00"),
    ("PA-EGG", "ถาดไข่กระดาษ", "WF-PAPER", "1.50"),
    ("PL-PET", "ขวดเพ็ทใส", "WF-PLASTIC", "9.00"),
    ("PL-PET-COLOR", "ขวดเพ็ทสี", "WF-PLASTIC", "5.00"),
    ("PL-HDPE", "แกลลอนขาวขุ่น", "WF-PLASTIC", "12.00"),
    ("PL-PP", "พลาสติกกรอบ", "WF-PLASTIC", "4.00"),
    ("PL-PVC", "ท่อพีวีซี", "WF-PLASTIC", "3.00"),
    ("PL-BAG", "ถุงพลาสติก", "WF-PLASTIC", "2.00"),
    ("GL-BOTTLE", "ขวดแก้ว", "WF-MISC", "1.00"),
    ("GL-BEER", "ขวดเบียร์", "WF-MISC", "1.20"),
    ("BAT-CAR", "แบตเตอรี่รถยนต์", "WF-MISC", "28.00"),
    ("EW-BOARD", "แผงวงจร", "WF-MISC", "35.00"),
    ("SS-SINK", "สแตนเลส", "WF-MISC", "40.00"),
    ("PB-LEAD", "ตะกั่ว", "WF-MISC", "45.00"),
]

TIER_STEP = {"A": Decimal("1.00"), "B": Decimal("0.98"), "C": Decimal("0.96"), "D": Decimal("0.94")}

# THE SELLER SEARCH WALK (seller search C3, ADVISOR-DECIDED 2026-10-12): 30 sellers in Shop A.
# EVERY PHONE AND ID IS OBVIOUSLY FAKE, by a stated pattern, and none is a seed row's number:
#   phone       081-000-01NN       (NN = 01..30; the `000-01` middle block marks it fake)
#   id_number   9900000 + 6 digits  (13 digits starting 9900000; no checksum -- the server
#                                    validates none, master.py IdNumber)
#   vehicle_no  the seller's usual truck, a Thai plate or a truck plate, on about two in three
# Two sellers share the name สมชาย ใจดี -- the walk's "two same-name sellers told apart".
# (code, name, grade, has_phone, has_id, plate or None)
SELLERS = [
    ("WS01", "สมชาย ใจดี", "A", True, True, "1กก 1001"),
    ("WS02", "สมชาย ใจดี", "B", True, True, "70-2002"),
    ("WS03", "สมหญิง รักษ์ดี", "B", True, True, None),
    ("WS04", "บุญมี ศรีสุข", "C", True, False, "2ขข 3003"),
    ("WS05", "ประยุทธ มั่นคง", "A", True, True, "81-4004"),
    ("WS06", "วิชัย ทองดี", "D", False, True, None),
    ("WS07", "สุดา แก้วใส", "B", True, True, "3คค 5005"),
    ("WS08", "มานะ อดทน", "C", True, False, "72-6006"),
    ("WS09", "ชูใจ สุขสันต์", "A", True, True, None),
    ("WS10", "ร้านเจริญรุ่งเรือง", "A", True, False, "4งง 7007"),
    ("WS11", "สมศักดิ์ เพชรงาม", "B", True, True, "1กข 8008"),
    ("WS12", "นิพนธ์ ดีมาก", "C", False, False, "75-9009"),
    ("WS13", "อำนวย ชัยชนะ", "D", True, True, None),
    ("WS14", "จันทร์เพ็ญ ศรีทอง", "B", True, True, "5จจ 1010"),
    ("WS15", "ทองใบ บุญมา", "A", True, True, "76-1111"),
    ("WS16", "สมพร ใจเย็น", "C", True, False, None),
    ("WS17", "ณรงค์ แสงทอง", "B", True, True, "6ฉฉ 1212"),
    ("WS18", "ประเสริฐ วงศ์ดี", "D", False, True, "78-1313"),
    ("WS19", "ละเอียด ถี่ถ้วน", "C", True, True, None),
    ("WS20", "บริษัท รีไซเคิลไทย จำกัด", "A", True, False, "80-1414"),
    ("WS21", "สายทอง คำดี", "B", True, True, "7ชช 1515"),
    ("WS22", "เกษม สุขใจ", "C", True, True, None),
    ("WS23", "ไพโรจน์ รุ่งเรือง", "A", True, False, "8ซซ 1616"),
    ("WS24", "สมบัติ มีทรัพย์", "B", True, True, "82-1717"),
    ("WS25", "อรุณ แจ่มใส", "D", False, False, None),
    ("WS26", "ลำดวน หอมหวาน", "C", True, True, "9ฌฌ 1818"),
    ("WS27", "ประจักษ์ ชัดเจน", "B", True, True, "85-1919"),
    ("WS28", "สมนึก นึกดี", "A", True, False, None),
    ("WS29", "ทวีศักดิ์ เพิ่มพูน", "C", True, True, "1ญญ 2020"),
    ("WS30", "รัตนา ใจงาม", "B", True, True, "86-2121"),
]


def fake_phone(n: int) -> str:
    return f"081-000-01{n:02d}"


def fake_id(n: int) -> str:
    return f"9900000{(1000 + n * 137) % 1000000:06d}"


def refuse(msg: str) -> None:
    print(f"WALK_FIXTURE REFUSED: {msg}")
    print("WALK_FIXTURE_EXIT=2")
    sys.exit(2)


def target_or_refuse(name: str) -> str:
    dev = make_url(os.environ["APP_DATABASE_URL"]).database
    if name == dev:
        refuse(f"{name!r} is the database server/.env names (dev)")
    # THE OWNER'S DEMO DATABASE (tools/owner/start_demo.cmd, 2026-10-19): lane-free on purpose --
    # the owner runs the demo with no lane set -- so it is accepted by its exact name, and only
    # after the dev refusal above.
    if name == DEMO_DATABASE:
        return name
    tag = lane_tag()
    if tag == "":
        refuse("RECYCLE_LANE is not set -- a walk fixture belongs to a lane's walk database"
               f" (or the owner's demo database {DEMO_DATABASE!r})")
    allowed_walk = scratch_name("recycle_walk")
    if name != allowed_walk and not (name.endswith(f"_scratch_{tag}") and name.startswith("recycle_")):
        refuse(f"{name!r} is not this lane's walk database ({allowed_walk!r}) or a recycle_*_scratch_{tag} name")
    return name


async def run(target: str) -> int:
    from sqlalchemy import text

    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.seeddata import TENANT_A_ID, UOM_A_ID

    async with tenant_connection(
        TENANT_A_ID, actor_id=SYSTEM_ACTOR_ID, actor_username="system:walk_fixture"
    ) as conn:
        db_now = (await conn.execute(text("SELECT current_database()"))).scalar_one()
        if db_now != target:
            raise SystemExit(f"WALK_FIXTURE REFUSED: connected to {db_now!r}, not {target!r}")
        cat_ids: dict[str, str] = {}
        cats_new = 0
        for code, name in CATEGORIES:
            r = await conn.execute(
                text(
                    "INSERT INTO product_categories (tenant_id, code, name) VALUES (:t, :c, :n)"
                    " ON CONFLICT (tenant_id, code) DO NOTHING"
                ),
                {"t": TENANT_A_ID, "c": code, "n": name},
            )
            cats_new += r.rowcount
            cat_ids[code] = str(
                (await conn.execute(
                    text("SELECT id FROM product_categories WHERE code = :c"), {"c": code}
                )).scalar_one()
            )
        prods_new = 0
        prices_written = 0
        for code, name, cat, price_a in PRODUCTS:
            r = await conn.execute(
                text(
                    "INSERT INTO products (tenant_id, category_id, uom_id, code, name, is_active)"
                    " VALUES (:t, :c, :u, :code, :n, true) ON CONFLICT (tenant_id, code) DO NOTHING"
                ),
                {"t": TENANT_A_ID, "c": cat_ids[cat], "u": UOM_A_ID, "code": code, "n": name},
            )
            prods_new += r.rowcount
            pid = (await conn.execute(
                text("SELECT id FROM products WHERE code = :code"), {"code": code}
            )).scalar_one()
            for grade, step in TIER_STEP.items():
                # Decimal, never float: product_prices.price is NUMERIC(14,2).
                price = (Decimal(price_a) * step).quantize(Decimal("0.01"))
                r = await conn.execute(
                    text(
                        "INSERT INTO product_prices (tenant_id, product_id, grade, price)"
                        " VALUES (:t, :p, :g, :price) ON CONFLICT (tenant_id, product_id, grade) DO NOTHING"
                    ),
                    {"t": TENANT_A_ID, "p": pid, "g": grade, "price": price},
                )
                prices_written += r.rowcount
        sellers_new = 0
        for i, (code, name, grade, has_phone, has_id, plate) in enumerate(SELLERS, start=1):
            r = await conn.execute(
                text(
                    "INSERT INTO sellers (tenant_id, code, name, phone, grade, id_number, vehicle_no,"
                    " is_active) VALUES (:t, :code, :n, :ph, :g, :idn, :veh, true)"
                    " ON CONFLICT (tenant_id, code) DO NOTHING"
                ),
                {"t": TENANT_A_ID, "code": code, "n": name,
                 "ph": fake_phone(i) if has_phone else None, "g": grade,
                 "idn": fake_id(i) if has_id else None, "veh": plate},
            )
            sellers_new += r.rowcount
        totals = (await conn.execute(text(
            "SELECT (SELECT count(*) FROM product_categories),"
            " (SELECT count(*) FROM products WHERE is_active),"
            " (SELECT count(*) FROM product_prices),"
            " (SELECT count(*) FROM sellers WHERE is_active)"
        ))).one()
    print(f"WALK_FIXTURE target={target}")
    print(f"  wrote this run: categories={cats_new} products={prods_new} prices={prices_written}"
          f" sellers={sellers_new}")
    print(f"  Shop A now holds: categories={totals[0]} active_products={totals[1]} prices={totals[2]}"
          f" active_sellers={totals[3]}")
    print("WALK_FIXTURE_EXIT=0")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", required=True, help="a lane walk/scratch database NAME (never a URL)")
    target = target_or_refuse(ap.parse_args().database)
    for key in URL_KEYS:
        os.environ[key] = make_url(os.environ[key]).set(database=target).render_as_string(hide_password=False)
    return asyncio.run(run(target))


if __name__ == "__main__":
    sys.exit(main())
