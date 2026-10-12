"""Prove the desktop's bill reads and void over real HTTP (B3, 2026-10-12; SRS 2.1, 3.2).

    uv run python scripts/prove_bill_filters.py     (self-restores a scratch from a live dump)

GET /bills gains OPTIONAL from_date / to_date (shop days), seller_id and include_voided, and every
row and the detail carry the seller's code and NAME (never id_number or address). The void route
is unchanged; this proves the desktop's use of it: a void with a reason reads back, and the row
is still there (hard rule 5).

FIXTURE, per run: a per-run admin and a per-run staff user in Shop A (SQL, declared actor); TWO
PER-RUN SELLERS P and Q through the real POST /sellers; three bills through the REAL POST /bills --
two for P (one moved to YESTERDAY by SQL on this scratch, the shop-day filter's only lever), one
for Q. Every date cell is ALSO filtered to the per-run sellers: the scratch is a copy of dev, which
holds hundreds of other bills from today's proof runs, and the list's 200-row ceiling would push a
fixture bill off the page (measured: the first run's S1/N1 reds, a fixture flaw, not the filter).

  E0  /openapi.json declares the four new query parameters
  D1  from_date=to_date=today lists today's two fixture bills, not yesterday's
  D2  from_date=to_date=yesterday lists yesterday's, not today's
  D3  a reversed range is a 422 naming date_range_reversed
  S1  seller_id=S001 over both days lists exactly the two S001 bills
  N1  every fixture row carries seller_code and seller_name; NO row carries id_number or address
  N2  the detail carries seller_code and seller_name
  V1  staff (no bills.void) voiding is refused 403 naming bills.void, and the bill is untouched
  V2  admin voids with a reason -> 200, status voided, the reason read back over HTTP
  V3  the voided bill is GONE from the default list and PRESENT with include_voided, its reason on
      the row; and the purchase_bills row still exists in Postgres (count 1)
  V4  absent filters: the list is exactly the old shape plus the new keys (back-compat)
  V5  a second void (no key) of a voided bill -> 409; the first void's record unchanged
  W1  TWO CONCURRENT VOIDS, with a barrier built from Postgres itself: a superuser connection holds
      the bill's row lock while two admins void it; the cell waits until BOTH UPDATEs are seen
      blocked on that lock at the same moment (pg_stat_activity), then releases it
  W2  exactly one 200 and one 409 naming bill_already_voided
  W3  the stored record (voided_by, void_reason, void_idempotency_key) equals the WINNER's, read
      from Postgres value against value
  W4  the winner's replay with the SAME idempotency key -> 200, the original outcome, record unchanged
  W5  the loser's replay with ITS key -> still 409; record unchanged
"""
from __future__ import annotations

import asyncio
import datetime as dt
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.seeddata import PRODUCT_A_ID, TENANT_A_ID  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402
SCRATCH_DB = scratch_name("recycle_bill_filters_scratch")
RUN = uuid.uuid4().hex[:8]
ORIG_ENV = dict(os.environ)
SHOP_TZ = dt.timezone(dt.timedelta(hours=7))
PW = {"adm": f"pw-{RUN}-adm", "adm2": f"pw-{RUN}-adm2", "stf": f"pw-{RUN}-stf"}
USER_IDS: dict[str, uuid.UUID] = {}

failures: list[str] = []
passes: list[str] = []


def check(cond: bool, label: str) -> None:
    (passes if cond else failures).append(label)
    print(f"  [{'OK  ' if cond else 'RED '}] {label}")


def restore(live: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-billf-dump-{RUN}")
    label = f"billf-{RUN}"
    cp = subprocess.run([sys.executable, os.path.join("scripts", "backup_db.py"), "--db", live, "--out", out,
                         "--label", label], cwd=SERVER_DIR, capture_output=True, text=True, timeout=300,
                        encoding="utf-8", errors="replace", env=ORIG_ENV)
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py failed: {(cp.stdout + cp.stderr)[-500:]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    cp = subprocess.run([sys.executable, os.path.join("scripts", "restore_db.py"), os.path.join(out, dumps[0]),
                         "--into", SCRATCH_DB], cwd=SERVER_DIR, capture_output=True, text=True, timeout=300,
                        encoding="utf-8", errors="replace", env=ORIG_ENV)
    shutil.rmtree(out, ignore_errors=True)
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py failed: {(cp.stdout + cp.stderr)[-500:]}")


async def provision() -> None:
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.security import hash_password
    async with tenant_connection(TENANT_A_ID, actor_id=SYSTEM_ACTOR_ID,
                                 actor_username="system:prove_bill_filters") as conn:
        for key, role in (("adm", "admin"), ("adm2", "admin"), ("stf", "staff")):
            rid = (await conn.execute(text("SELECT id FROM roles WHERE code = :c"), {"c": role})).scalar_one()
            USER_IDS[key] = uuid.uuid4()
            await conn.execute(
                text("INSERT INTO users (id, tenant_id, username, full_name, role_id, password_hash)"
                     " VALUES (:id, :t, :u, :fn, :r, :ph)"),
                {"id": USER_IDS[key], "t": TENANT_A_ID, "u": f"{key}-{RUN}", "fn": key, "r": rid,
                 "ph": await hash_password(PW[key])})


async def move_to_yesterday(bill_id: str) -> None:
    import asyncpg
    u = make_url(ORIG_ENV["APP_DATABASE_URL"])
    c = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database=SCRATCH_DB)
    try:
        await c.execute("UPDATE purchase_bills SET server_received_at = server_received_at - interval '1 day'"
                        " WHERE id = $1", uuid.UUID(bill_id))
    finally:
        await c.close()


async def row_count(bill_id: str) -> int:
    import asyncpg
    u = make_url(ORIG_ENV["APP_DATABASE_URL"])
    c = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database=SCRATCH_DB)
    try:
        return int(await c.fetchval("SELECT count(*) FROM purchase_bills WHERE id = $1", uuid.UUID(bill_id)))
    finally:
        await c.close()


async def race_two_voids(base: str, bill_id: str, a: tuple[dict, str, str], b: tuple[dict, str, str]) -> dict:
    """Both voids held at the bill's row lock until Postgres shows them BOTH waiting, then released."""
    import asyncpg
    u = make_url(ORIG_ENV["APP_DATABASE_URL"])
    su = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database=SCRATCH_DB)
    # The WATCHER is a second connection, outside the lock-holder's transaction: inside a
    # transaction pg_stat_activity is read ONCE and cached, so polling from the lock holder re-reads
    # its first, empty picture forever (measured: the first W1 run saw 0 waiters every time).
    mon = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database=SCRATCH_DB)
    waiting = 0
    try:
        tr = su.transaction()
        await tr.start()
        await su.execute("SELECT 1 FROM purchase_bills WHERE id = $1 FOR UPDATE", uuid.UUID(bill_id))
        async with httpx.AsyncClient(timeout=60) as c:
            tasks = [asyncio.create_task(c.post(f"{base}/bills/{bill_id}/void", headers=h,
                                                json={"reason": r, "idempotency_key": k})) for h, r, k in (a, b)]
            for _ in range(200):
                waiting = int(await mon.fetchval(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'"
                    " AND query ILIKE '%UPDATE purchase_bills%voided_at%'", SCRATCH_DB))
                if waiting >= 2:
                    break
                await asyncio.sleep(0.05)
            snapshot = [dict(r) for r in await mon.fetch(
                "SELECT pid, state, wait_event_type, wait_event, left(query, 90) AS q FROM pg_stat_activity"
                " WHERE datname = $1 AND pid <> pg_backend_pid()", SCRATCH_DB)]
            await tr.rollback()
            ra, rb = await asyncio.gather(*tasks)
    finally:
        await su.close()
        await mon.close()
    return {"waiting": waiting, "a": ra, "b": rb, "snapshot": snapshot}


async def void_record_full(bill_id: str) -> tuple:
    import asyncpg
    u = make_url(ORIG_ENV["APP_DATABASE_URL"])
    c = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database=SCRATCH_DB)
    try:
        r = await c.fetchrow("SELECT voided_at, voided_by, void_reason, void_idempotency_key FROM purchase_bills"
                             " WHERE id = $1", uuid.UUID(bill_id))
        return (r["voided_at"], r["voided_by"], r["void_reason"], r["void_idempotency_key"])
    finally:
        await c.close()


async def void_record(bill_id: str) -> tuple:
    import asyncpg
    u = make_url(ORIG_ENV["APP_DATABASE_URL"])
    c = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database=SCRATCH_DB)
    try:
        r = await c.fetchrow("SELECT voided_at, voided_by, void_reason FROM purchase_bills WHERE id = $1", uuid.UUID(bill_id))
        return (r["voided_at"], r["voided_by"], r["void_reason"])
    finally:
        await c.close()


def login(base: str, key: str) -> dict:
    r = httpx.post(f"{base}/auth/login", timeout=15, json={"tenant_id": str(TENANT_A_ID), "username": f"{key}-{RUN}",
                                                            "password": PW[key]})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# Needles for the personal-data cells: seller P is created WITH an ID number and an address, so an
# absence on a bill read means the route left them out, not that there was nothing to leak.
ID_NEEDLE = f"77{RUN.replace('-', '')[:10]}"
ADDR_NEEDLE = f"addr-needle-{RUN}"


def post_seller(base: str, h: dict, tag: str, personal: bool = False) -> str:
    body = {"name": f"bill filter {tag} {RUN}", "grade": "B"}
    if personal:
        body |= {"id_number": ID_NEEDLE, "address": ADDR_NEEDLE}
    r = httpx.post(f"{base}/sellers", headers=h, timeout=15, json=body)
    if r.status_code != 201:
        raise RuntimeError(f"POST /sellers {tag} -> {r.status_code}: {r.text[:300]}")
    return r.json()["id"]


def post_bill(base: str, h: dict, seller: str, tag: str) -> str:
    bill_id = str(uuid.uuid4())
    r = httpx.post(f"{base}/bills", headers=h, timeout=15, json={
        "id": bill_id, "seller_id": str(seller), "vehicle_no": f"BF-{tag}",
        "device_created_at": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
        "idempotency_key": f"billf-{RUN}-{tag}",
        "items": [{"id": str(uuid.uuid4()), "product_id": str(PRODUCT_A_ID), "line_no": 1,
                   "gross_weight": "2.000", "tare_weight": "0.500", "net_weight": "1.500", "unit_price": "15.00"}]})
    if r.status_code != 201:
        raise RuntimeError(f"POST /bills {tag} -> {r.status_code}: {r.text[:300]}")
    return bill_id


def ids(r: httpx.Response) -> set[str]:
    return {b["id"] for b in r.json()["bills"]}


def run_cells(base: str) -> None:
    doc = httpx.get(f"{base}/openapi.json", timeout=10).json()
    names = {p["name"] for p in doc["paths"]["/bills"]["get"].get("parameters", [])}
    check({"from_date", "to_date", "seller_id", "include_voided"} <= names,
          f"E0 GET /bills declares the four new parameters ({sorted(names)})")
    adm = login(base, "adm")
    stf = login(base, "stf")
    sp = post_seller(base, adm, "P", personal=True)
    sq = post_seller(base, adm, "Q")
    t1 = post_bill(base, adm, sp, "t1")
    t2 = post_bill(base, adm, sq, "t2")
    y1 = post_bill(base, adm, sp, "y1")
    asyncio.run(move_to_yesterday(y1))
    today = dt.datetime.now(tz=SHOP_TZ).date()
    yday = today - dt.timedelta(days=1)
    mine = {t1, t2, y1}

    def lst(**q) -> httpx.Response:
        return httpx.get(f"{base}/bills", headers=adm, timeout=15, params={"limit": 200, **q})

    r = lst(from_date=today.isoformat(), to_date=today.isoformat(), seller_id=sp)
    check(r.status_code == 200 and ids(r) == {t1},
          f"D1 seller P today -> exactly t1, not yesterday's y1 ({sorted(ids(r))})")
    r = lst(from_date=yday.isoformat(), to_date=yday.isoformat(), seller_id=sp)
    check(r.status_code == 200 and ids(r) == {y1},
          f"D2 seller P yesterday -> exactly y1 ({sorted(ids(r))})")
    r = lst(from_date=today.isoformat(), to_date=yday.isoformat())
    d = r.json().get("detail") if r.status_code == 422 else None
    check(r.status_code == 422 and isinstance(d, dict) and d.get("code") == "date_range_reversed",
          f"D3 a reversed range -> 422 date_range_reversed (got {r.status_code} {d})")
    r = lst(from_date=yday.isoformat(), to_date=today.isoformat(), seller_id=sp)
    check(r.status_code == 200 and ids(r) == {t1, y1} and all(b["seller_id"] == sp for b in r.json()["bills"]),
          f"S1 seller P over both days -> exactly t1 and y1 ({sorted(ids(r))})")
    rq = lst(from_date=yday.isoformat(), to_date=today.isoformat(), seller_id=sq)
    check(rq.status_code == 200 and ids(rq) == {t2}, f"S1 seller Q over both days -> exactly t2 ({sorted(ids(rq))})")
    rows = [b for b in r.json()["bills"] + rq.json()["bills"] if b["id"] in mine]
    check(len(rows) == 3 and all(b.get("seller_code") and b.get("seller_name") for b in rows)
          and not any("id_number" in b or "address" in b for b in r.json()["bills"]),
          f"N1 every fixture row names its seller; no row carries id_number/address ({[(b['seller_code'], b['seller_name']) for b in rows]})")
    det = httpx.get(f"{base}/bills/{t1}", headers=adm, timeout=15).json()
    check(bool(det.get("seller_code")) and det.get("seller_name") == f"bill filter P {RUN}",
          f"N2 the detail names the seller ({det.get('seller_code')!r} {det.get('seller_name')!r})")
    # N3 (red team 2026-10-12): the detail is the payload a slip is built from, and it reads the seller
    # table itself. CONTROL first: the needles are really there, readable by a read_personal holder.
    # (There is no GET /sellers/{id}; the list is the seller read that passes the personal-data gate.)
    ctl = httpx.get(f"{base}/sellers", headers=adm, timeout=15)
    seen = ctl.status_code == 200 and ID_NEEDLE in ctl.text and ADDR_NEEDLE in ctl.text
    leaks = []
    for who, h in (("staff", stf), ("admin", adm)):
        for path in (f"/bills/{t1}", f"/bills?limit=200&seller_id={sp}&from_date={yday.isoformat()}&to_date={today.isoformat()}"):
            body = httpx.get(f"{base}{path}", headers=h, timeout=15).text
            if ID_NEEDLE in body or ADDR_NEEDLE in body:
                leaks.append(f"{who} {path.split('?')[0]}")
    check(seen and not leaks,
          f"N3 control: GET /sellers as admin shows the ID and address ({seen}); no bill read, detail or list, staff or admin, carries either ({leaks})")

    reason = f"ชั่งผิดรายการ {RUN}"
    rs = httpx.post(f"{base}/bills/{t2}/void", headers=stf, timeout=15, json={"reason": reason})
    sd = rs.json().get("detail") if rs.status_code == 403 else {}
    still = httpx.get(f"{base}/bills/{t2}", headers=adm, timeout=15).json()
    check(rs.status_code == 403 and sd.get("required_permission") == "bills.void" and still.get("status") == "active",
          f"V1 staff void -> 403 naming bills.void; the bill still active (got {rs.status_code}, {still.get('status')})")
    rv = httpx.post(f"{base}/bills/{t2}/void", headers=adm, timeout=15, json={"reason": reason})
    back = httpx.get(f"{base}/bills/{t2}", headers=adm, timeout=15).json()
    check(rv.status_code == 200 and back.get("status") == "voided" and back.get("void_reason") == reason
          and back.get("voided_at"), f"V2 admin void -> 200; read back: status {back.get('status')!r}, reason {back.get('void_reason')!r}")
    default = lst(from_date=today.isoformat(), to_date=today.isoformat(), seller_id=sq)
    withv = lst(from_date=today.isoformat(), to_date=today.isoformat(), seller_id=sq, include_voided="true")
    vrow = next((b for b in withv.json()["bills"] if b["id"] == t2), {})
    count = asyncio.run(row_count(t2))
    check(t2 not in ids(default) and vrow.get("status") == "voided" and vrow.get("void_reason") == reason and count == 1,
          f"V3 voided: gone by default, present with include_voided and its reason; Postgres rows={count}")
    # V5 (red team 2026-10-12): a SECOND void of the same bill is refused, and the first void's who,
    # when and why are untouched (hard rule 5: the record of a void is history too).
    first = asyncio.run(void_record(t2))
    again = httpx.post(f"{base}/bills/{t2}/void", headers=adm, timeout=15, json={"reason": f"second {RUN}"})
    after = asyncio.run(void_record(t2))
    check(again.status_code == 409 and after == first and first[2] == reason,
          f"V5 a second void -> 409 and voided_at/voided_by/void_reason unchanged (got {again.status_code}; same={after == first})")
    # W: two concurrent voids of one bill, held at a barrier Postgres can see.
    adm2 = login(base, "adm2")
    w = post_bill(base, adm, sq, "w1")
    ka, kb = f"void-a-{RUN}", f"void-b-{RUN}"
    rsn_a, rsn_b = f"ชั่งซ้ำ A {RUN}", f"รถผิดคัน B {RUN}"
    out = asyncio.run(race_two_voids(base, w, (adm, rsn_a, ka), (adm2, rsn_b, kb)))
    check(out["waiting"] >= 2, f"W1 both voids seen blocked on the bill's row lock at once ({out['waiting']} waiting)"
          + ("" if out["waiting"] >= 2 else f" snapshot={out['snapshot']}"))
    codes = sorted([out["a"].status_code, out["b"].status_code])
    loser = out["a"] if out["a"].status_code == 409 else out["b"]
    ldet = loser.json().get("detail") if loser.status_code == 409 else None
    check(codes == [200, 409] and isinstance(ldet, dict) and ldet.get("code") == "bill_already_voided"
          and bool(ldet.get("message")), f"W2 exactly one 200 and one 409 bill_already_voided (got {codes}, {ldet})")
    a_won = out["a"].status_code == 200
    win = ("adm", rsn_a, ka, adm) if a_won else ("adm2", rsn_b, kb, adm2)
    lose = ("adm2", rsn_b, kb, adm2) if a_won else ("adm", rsn_a, ka, adm)
    rec = asyncio.run(void_record_full(w))
    check(rec[0] is not None and rec[1] == USER_IDS[win[0]] and rec[2] == win[1] and rec[3] == win[2],
          f"W3 Postgres holds the winner's record: voided_by {rec[1] == USER_IDS[win[0]]}, reason {rec[2] == win[1]},"
          f" key {rec[3] == win[2]} (winner {win[0]})")
    rp = httpx.post(f"{base}/bills/{w}/void", headers=win[3], timeout=15, json={"reason": win[1], "idempotency_key": win[2]})
    rec_after = asyncio.run(void_record_full(w))
    check(rp.status_code == 200 and rp.json().get("status") == "voided" and rp.json().get("void_reason") == win[1]
          and rec_after == rec, f"W4 the winner's replay (same key) -> {rp.status_code}, the original outcome; record unchanged {rec_after == rec}")
    rl = httpx.post(f"{base}/bills/{w}/void", headers=lose[3], timeout=15, json={"reason": lose[1], "idempotency_key": lose[2]})
    check(rl.status_code == 409 and asyncio.run(void_record_full(w)) == rec,
          f"W5 the loser's replay (its own key) -> {rl.status_code}; record unchanged")

    plain = httpx.get(f"{base}/bills", headers=adm, timeout=15, params={"limit": 5})
    keys = set(plain.json()["bills"][0]) if plain.json()["bills"] else set()
    old = {"id", "doc_no", "branch_id", "seller_id", "vehicle_no", "total_amount", "paid_amount", "payment_status",
           "device_created_at", "server_received_at"}
    check(plain.status_code == 200 and old <= keys, f"V4 no filters: every old key still present ({sorted(old - keys)} missing)")


def main() -> int:
    live = make_url(os.environ["APP_DATABASE_URL"]).database
    if SCRATCH_DB == live:
        print("REFUSED: scratch equals live")
        return 2
    try:
        restore(live)
    except Exception as exc:  # noqa: BLE001
        print(f"REFUSED: could not restore the scratch: {exc}")
        return 2
    for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL", "MIGRATION_DATABASE_URL"):
        os.environ[key] = make_url(ORIG_ENV[key]).set(database=SCRATCH_DB).render_as_string(hide_password=False)
    asyncio.run(provision())
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = int(s.getsockname()[1])
    base = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_billf_", delete=False, encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-u", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port",
                             str(port), "--log-level", "warning"], cwd=SERVER_DIR, env=dict(os.environ),
                            stdout=log, stderr=subprocess.STDOUT)
    try:
        deadline = time.time() + 40
        while time.time() < deadline:
            if proc.poll() is not None:
                check(False, f"E0 server started (exited {proc.returncode})")
                return 1
            try:
                if httpx.get(f"{base}/health", timeout=2).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.25)
        run_cells(base)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()
    print(f"\n{len(passes)} OK, {len(failures)} RED")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = 1
    try:
        rc = main()
    finally:
        print(f"PROVE_BILL_FILTERS_EXIT={rc}")
    sys.exit(rc)
