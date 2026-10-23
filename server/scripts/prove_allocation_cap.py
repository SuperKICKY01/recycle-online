"""H4 (ADVISOR-DECIDED 2026-10-23): THE ALLOCATION CAP IN THE DATABASE (migration 0026).

A bill's live allocations may never exceed its total. Until 0026 only the payments route enforced it,
under its row lock; prove_money_faults RB measured 4 of 5 races overpaying a 100.00 bill with that
lock removed. Model on prove_money_faults.py: a scratch restored from a live dump, brought to head
here, a per-run shop provisioned by SQL with its master data built through the API, every figure
read back out of Postgres as the superuser.

  M1-M3  the migration on this scratch: up (the 3 triggers and 4 functions exist), DOWN to 0025
         (none remains, every payment and allocation row value-equal), UP again (all back).
  N1-N3  THE NORMAL PATHS UNCHANGED: a bill's automatic payment (paid), a separated counter's payment
         in two parts (partial, then paid), and the route's own refusal past the remainder (422
         allocation_exceeds_bill naming the remaining figure -- the route's check, first).
  L0     A SECOND SERVER WITH THE APPLICATION LOCK REMOVED: this script re-executes itself with
         --serve-nolock, which strips ` FOR NO KEY UPDATE` from the route's one bill read (and
         counts it -- the mutation is read back PRESENT from the server's log, never assumed).
  L1     with that server, the bill row HELD in the route's mode: the payment still WAITS -- at its
         allocation INSERT, the database's own lock (pg_stat_activity as the superuser names it).
  L2     THE RACE, 5 rounds, 60.00 + 60.00 against a 100.00 bill released together, the app lock
         removed: 0 overpayments -- every round one 201 and one 422 allocation_exceeds_bill (the
         database's RA001, worded by the route), live allocations 60.00, read from Postgres.
  L3     THE DATABASE'S REFUSAL, HELD (a race is a coin): the bill row held while two 60.00 payments
         arrive, both pass the lock-less route check and wait at their INSERT; released, one is 201
         and the other 422 WITHOUT `remaining` -- the database's RA001, not the route's check.
  S1-S4  THE OTHER DOORS, by SQL: as recycle_app under the shop's context an over-cap INSERT is
         RA001 naming the bill; the same under REPEATABLE READ is RA002; a voided payment made
         live again over the cap is RA001; a bill's total lowered under its allocations is RA001.

THE DISPROOF, RUN BY HAND (2026-10-23): migration 0026's comparison disabled (`IF v_live > v_total`
-> `IF false AND v_live > v_total`) -> L2 red (overpayments), S1/S3/S4 red; restored byte-identical.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402  (scratch names are decided in lane.py only)
SCRATCH_DB = scratch_name("recycle_allocation_cap_scratch")
RUN = uuid.uuid4().hex[:8]
ORIG_ENV = dict(os.environ)
D = Decimal
SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000"
CAP_TRIGGERS = ("allocation_cap_on_allocation", "allocation_cap_on_unvoid", "allocation_cap_on_total")

failures: list[str] = []
passes: list[str] = []


def check(cond: bool, claim: str) -> None:
    print(f"  [{'OK  ' if cond else 'RED '}] {claim}")
    (passes if cond else failures).append(claim)


def header(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-cap-dump-{RUN}")
    label = f"cap-{RUN}"
    cp = subprocess.run([sys.executable, os.path.join("scripts", "backup_db.py"), "--db", live_name,
                         "--out", out, "--label", label], cwd=SERVER_DIR, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py (live) failed: {cp.stderr.strip()[:600]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    if len(dumps) != 1:
        raise RuntimeError(f"expected one dump dir ending {label!r}, got {dumps}")
    cp = subprocess.run([sys.executable, os.path.join("scripts", "restore_db.py"), os.path.join(out, dumps[0]),
                         "--into", scratch], cwd=SERVER_DIR, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py -> {scratch} failed: {cp.stderr.strip()[:600]}")
    shutil.rmtree(out, ignore_errors=True)


def run_alembic(scratch: str, *args: str) -> tuple[int, str]:
    env = dict(ORIG_ENV)
    env["MIGRATION_DATABASE_URL"] = (make_url(ORIG_ENV["MIGRATION_DATABASE_URL"]).set(database=scratch)
                                     .render_as_string(hide_password=False))
    env["PYTHONIOENCODING"] = "utf-8"
    cp = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=SERVER_DIR, env=env, capture_output=True,
                        text=True, timeout=600, encoding="utf-8", errors="replace")
    return cp.returncode, cp.stdout + cp.stderr


class Server:
    def __init__(self, *, nolock: bool) -> None:
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.log_path = os.path.join(tempfile.gettempdir(), f"prove_allocation_cap_{RUN}_{self.port}.log")
        self.log = open(self.log_path, "w", encoding="utf-8")
        argv = ([sys.executable, "-u", os.path.abspath(__file__), "--serve-nolock", str(self.port)] if nolock else
                [sys.executable, "-u", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                 "--port", str(self.port), "--log-level", "warning"])
        self.proc = subprocess.Popen(argv, cwd=SERVER_DIR, env=dict(os.environ), stdout=self.log,
                                     stderr=subprocess.STDOUT)

    def wait(self, timeout: float = 40.0) -> str:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.proc.poll() is not None:
                return f"the uvicorn child exited with code {self.proc.returncode}"
            try:
                if httpx.get(f"{self.base}/health", timeout=2.0).status_code == 200:
                    return ""
            except httpx.HTTPError:
                pass
            time.sleep(0.25)
        return "health never came up within the timeout"

    def text(self) -> str:
        self.log.flush()
        with open(self.log_path, encoding="utf-8", errors="replace") as f:
            return f.read()

    def stop(self) -> None:
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.log.close()
        try:
            os.unlink(self.log_path)
        except OSError:
            pass


def serve_nolock(port: int) -> None:
    """The L-cells' server: today's app with ONE change -- the payments route's bill read loses its
    `FOR NO KEY UPDATE`. app.payments looks `text` up at call time, so only that module's statements
    pass through here, and each strip is printed so the parent can read the mutation back."""
    import app.payments as payments
    import uvicorn
    real = payments.text

    def text_nolock(sql: str, *a: Any, **k: Any):
        if "FROM purchase_bills WHERE id = :b FOR NO KEY UPDATE" in sql:
            print("NOLOCK: the route's bill lock stripped", flush=True)
            sql = sql.replace(" FOR NO KEY UPDATE", "")
        return real(sql, *a, **k)

    payments.text = text_nolock
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="warning")


class Db:
    def __init__(self, url: str, scratch: str) -> None:
        u = make_url(url)
        self.host, self.port, self.scratch = u.host, u.port, scratch
        self.app_user, self.app_pw = u.username, u.password

    async def su(self) -> asyncpg.Connection:
        return await asyncpg.connect(host=self.host, port=self.port, user="postgres", password="postgres",
                                     database=self.scratch)

    async def app(self) -> asyncpg.Connection:
        return await asyncpg.connect(host=self.host, port=self.port, user=self.app_user, password=self.app_pw,
                                     database=self.scratch)

    async def fetch(self, sql: str, *args: Any) -> list:
        c = await self.su()
        try:
            return await c.fetch(sql, *args)
        finally:
            await c.close()

    async def fetchval(self, sql: str, *args: Any) -> Any:
        c = await self.su()
        try:
            return await c.fetchval(sql, *args)
        finally:
            await c.close()

    async def live(self, bill: str) -> Decimal:
        return D(await self.fetchval(
            "SELECT coalesce(sum(a.amount), 0) FROM payment_allocations a JOIN payments p ON p.id = a.payment_id"
            " WHERE a.bill_id = $1 AND p.voided_at IS NULL", uuid.UUID(bill)))

    async def objects(self) -> tuple[int, int]:
        t = await self.fetchval("SELECT count(*) FROM pg_trigger WHERE tgname = ANY($1::text[]) AND NOT tgisinternal",
                                list(CAP_TRIGGERS))
        f = await self.fetchval("SELECT count(*) FROM pg_proc WHERE proname LIKE 'allocation_cap_%'")
        return int(t), int(f)

    async def ledger(self) -> tuple:
        p = await self.fetch("SELECT row_to_json(x)::text FROM payments x ORDER BY 1")
        a = await self.fetch("SELECT row_to_json(x)::text FROM payment_allocations x ORDER BY 1")
        return tuple(r[0] for r in p), tuple(r[0] for r in a)


class Shop:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.admin = uuid.uuid4()
        self.name = f"admin-cap-{RUN}"
        self.pw = f"pw-admin-cap-{RUN}"
        self.tok = ""
        self.ids: dict[str, str] = {}


async def provision(shop: Shop) -> None:
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.permissions import seed_system_roles
    from app.security import hash_password

    async with tenant_connection(shop.id, actor_id=SYSTEM_ACTOR_ID, actor_username="system:prove_allocation_cap") as conn:
        await conn.execute(text("INSERT INTO tenants (id, name) VALUES (:id, :n)"), {"id": shop.id, "n": f"CAP {RUN}"})
        await conn.execute(text("INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                                " VALUES (:t, 'MAIN', :n, 'B', true)"), {"t": shop.id, "n": f"CAP {RUN}"})
        roles = await seed_system_roles(conn, shop.id)
        await conn.execute(text("INSERT INTO users (id, tenant_id, username, full_name, role_id, password_hash)"
                                " VALUES (:id, :t, :u, :u, :r, :ph)"),
                           {"id": shop.admin, "t": shop.id, "u": shop.name, "r": roles["admin"],
                            "ph": await hash_password(shop.pw)})


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def code_of(r: httpx.Response) -> str | None:
    try:
        d = r.json().get("detail")
    except ValueError:
        return None
    return d.get("code") if isinstance(d, dict) else None


async def build(client: httpx.AsyncClient, shop: Shop) -> None:
    async def call(method: str, path: str, body: Any = None) -> dict:
        r = await client.request(method, path, headers=auth(shop.tok), json=body)
        if r.status_code not in (200, 201):
            raise RuntimeError(f"fixture: {method} {path} -> {r.status_code} {r.text[:300]}")
        return r.json()

    s = shop.ids
    s["branch"] = (await call("GET", "/shop"))["branch"]["id"]
    await call("POST", "/grade-tiers", {"code": "A", "name": "เกรด A"})
    uom = (await call("POST", "/uoms", {"code": "KG", "name": "กิโลกรัม"}))["id"]
    cat = (await call("POST", "/product-categories", {"code": "FE", "name": "เหล็ก"}))["id"]
    s["product"] = (await call("POST", "/products", {"code": "FE01", "name": "เหล็ก", "category_id": cat,
                                                      "uom_id": uom}))["id"]
    await call("PUT", f"/products/{s['product']}/prices/A", {"price": "10.00"})
    s["seller"] = (await call("POST", "/sellers", {"name": f"ผู้ขาย {RUN}"}))["id"]


def bill_body(shop: Shop, net: str) -> dict:
    return {"id": str(uuid.uuid4()), "seller_id": shop.ids["seller"], "device_created_at": now_iso(),
            "idempotency_key": f"cap-{uuid.uuid4()}",
            "items": [{"id": str(uuid.uuid4()), "product_id": shop.ids["product"], "line_no": 1,
                       "gross_weight": net, "tare_weight": "0.000", "net_weight": net, "unit_price": "10.00"}]}


def payment_body(shop: Shop, method: str, amount: str, bill: str | None, alloc: str | None = None) -> dict:
    return {"id": str(uuid.uuid4()), "seller_id": shop.ids["seller"], "method": method, "amount": amount,
            "idempotency_key": f"capp-{uuid.uuid4()}", "device_created_at": now_iso(),
            "allocations": [] if bill is None else [{"bill_id": bill, "amount": alloc or amount}]}


async def set_separate(client: httpx.AsyncClient, shop: Shop, on: bool) -> None:
    r = await client.patch(f"/branches/{shop.ids['branch']}", headers=auth(shop.tok), json={"separate_cashier": on})
    if r.status_code != 200:
        raise RuntimeError(f"PATCH /branches separate_cashier={on} -> {r.status_code}")


async def unpaid_bill(client: httpx.AsyncClient, shop: Shop, net: str = "10.000") -> str:
    body = bill_body(shop, net)
    r = await client.post("/bills", headers=auth(shop.tok), json=body)
    if r.status_code != 201 or r.json().get("payment_status") != "unpaid":
        raise RuntimeError(f"an unpaid bill: {r.status_code} {r.text[:200]}")
    return body["id"]


async def migration_cells(scratch: str, db: Db) -> bool:
    header("M  migration 0026 on this scratch: up, down to 0025, up")
    rc, out = run_alembic(scratch, "upgrade", "head")
    t, f = await db.objects()
    check(rc == 0 and (t, f) == (3, 4), f"M1 upgrade head: exit {rc}, cap triggers {t} of 3, functions {f} of 4"
                                        + ("" if rc == 0 else f" -- {out[-400:]}"))
    if rc != 0:
        return False
    before = await db.ledger()
    rc, out = run_alembic(scratch, "downgrade", "0025")
    t, f = await db.objects()
    after = await db.ledger()
    check(rc == 0 and (t, f) == (0, 0) and after == before,
          f"M2 downgrade to 0025: exit {rc}, triggers {t}, functions {f}; {len(before[0])} payments and"
          f" {len(before[1])} allocations value-equal" + ("" if rc == 0 else f" -- {out[-400:]}"))
    rc, out = run_alembic(scratch, "upgrade", "head")
    t, f = await db.objects()
    check(rc == 0 and (t, f) == (3, 4), f"M3 upgrade again: exit {rc}, triggers {t} of 3, functions {f} of 4")
    return rc == 0


async def normal_cells(client: httpx.AsyncClient, db: Db, shop: Shop) -> None:
    header("N  the normal paths, unchanged")
    body = bill_body(shop, "10.000")
    r = await client.post("/bills", headers=auth(shop.tok), json=body)
    check(r.status_code == 201 and r.json().get("payment_status") == "paid" and await db.live(body["id"]) == D("100.00"),
          f"N1 a bill's automatic payment: 201, paid, live allocations 100.00 ({r.status_code})")
    await set_separate(client, shop, True)
    try:
        bill = await unpaid_bill(client, shop)
        r1 = await client.post("/payments", headers=auth(shop.tok), json=payment_body(shop, "cash", "40.00", bill))
        r2 = await client.post("/payments", headers=auth(shop.tok), json=payment_body(shop, "cash", "60.00", bill))
        st = (await client.get(f"/bills/{bill}", headers=auth(shop.tok))).json()
        check(r1.status_code == 201 and r2.status_code == 201 and st.get("payment_status") == "paid"
              and await db.live(bill) == D("100.00"),
              f"N2 a counter pays 40.00 then 60.00: both 201, the bill paid, live 100.00")
        bill2 = await unpaid_bill(client, shop)
        await client.post("/payments", headers=auth(shop.tok), json=payment_body(shop, "cash", "70.00", bill2))
        r3 = await client.post("/payments", headers=auth(shop.tok), json=payment_body(shop, "cash", "40.00", bill2))
        d = r3.json().get("detail", {}) if r3.status_code == 422 else {}
        check(r3.status_code == 422 and d.get("code") == "allocation_exceeds_bill" and d.get("remaining") == "30.00"
              and await db.live(bill2) == D("70.00"),
              f"N3 past the remainder: the ROUTE's own 422 allocation_exceeds_bill naming remaining 30.00 ({r3.status_code}"
              f" {d.get('remaining')})")
    finally:
        await set_separate(client, shop, False)


async def nolock_cells(db: Db, shop: Shop) -> None:
    header("L  a server with the APPLICATION LOCK REMOVED: the database holds the cap alone")
    srv = Server(nolock=True)
    try:
        why = srv.wait()
        if why:
            check(False, f"L0 the no-lock server started -- {why}")
            return
        async with httpx.AsyncClient(base_url=srv.base, timeout=60.0) as client:
            await set_separate(client, shop, True)
            try:
                probe = await unpaid_bill(client, shop)
                r = await client.post("/payments", headers=auth(shop.tok), json=payment_body(shop, "cash", "1.00", probe))
                stripped = srv.text().count("NOLOCK: the route's bill lock stripped")
                check(r.status_code == 201 and stripped >= 1,
                      f"L0 the mutation is PRESENT: the server stripped the route's bill lock {stripped} time(s)")

                # L1 -- hold the bill in the route's mode; the payment must still wait, at the INSERT.
                bill = await unpaid_bill(client, shop)
                su = await db.su()
                tr = su.transaction()
                await tr.start()
                t0 = time.monotonic()
                try:
                    await su.execute("SELECT id FROM purchase_bills WHERE id = $1 FOR NO KEY UPDATE", uuid.UUID(bill))

                    async def timed() -> tuple[httpx.Response, float]:
                        rr = await client.post("/payments", headers=auth(shop.tok),
                                               json=payment_body(shop, "cash", "10.00", bill))
                        return rr, time.monotonic()

                    task = asyncio.create_task(timed())
                    await asyncio.sleep(0.8)
                    waiting = await db.fetch("SELECT query FROM pg_stat_activity WHERE datname = $1"
                                             " AND wait_event_type = 'Lock'", db.scratch)
                    await asyncio.sleep(0.7)
                    released = time.monotonic()
                finally:
                    await tr.rollback()
                    await su.close()
                rr, done = await task
                at_insert = [" ".join((w["query"] or "").split()) for w in waiting]
                named = [q for q in at_insert if "INSERT INTO payment_allocations" in q]
                check(rr.status_code == 201 and done >= released and bool(named),
                      f"L1 the bill row held: the payment WAITED ({done - t0:.2f}s, completed after the release) and"
                      f" pg_stat_activity names it at `INSERT INTO payment_allocations` -- the database's lock"
                      f" ({len(named)} of {len(at_insert)} waiting)")

                # L3 -- THE DATABASE'S REFUSAL, MADE DETERMINISTIC. The bill row is held while two 60.00
                # payments arrive: with no lock in the route, both pass its check (no allocation exists
                # yet) and both block at their allocation INSERT, on the trigger's lock. On release one
                # commits; the other's trigger then sees it and refuses (RA001). The route's own refusal
                # names `remaining`; the database's does not -- so the body says WHICH layer refused.
                b3 = await unpaid_bill(client, shop)
                su = await db.su()
                tr = su.transaction()
                await tr.start()
                try:
                    await su.execute("SELECT id FROM purchase_bills WHERE id = $1 FOR NO KEY UPDATE", uuid.UUID(b3))
                    pa = asyncio.create_task(client.post("/payments", headers=auth(shop.tok),
                                                         json=payment_body(shop, "cash", "60.00", b3)))
                    pb = asyncio.create_task(client.post("/payments", headers=auth(shop.tok),
                                                         json=payment_body(shop, "transfer", "60.00", b3)))
                    await asyncio.sleep(1.0)
                    blocked = await db.fetch("SELECT query FROM pg_stat_activity WHERE datname = $1"
                                             " AND wait_event_type = 'Lock'", db.scratch)
                finally:
                    await tr.rollback()
                    await su.close()
                r_a, r_b = await pa, await pb
                both = sorted([r_a, r_b], key=lambda x: x.status_code)
                refused = both[1].json().get("detail", {}) if both[1].status_code == 422 else {}
                ins = sum(1 for w in blocked if "INSERT INTO payment_allocations" in (w["query"] or ""))
                check(ins == 2 and both[0].status_code == 201 and refused.get("code") == "allocation_exceeds_bill"
                      and "remaining" not in refused and await db.live(b3) == D("60.00"),
                      f"L3 both payments passed the lock-less route check and waited at the INSERT ({ins} of 2);"
                      f" released: one 201, one 422 allocation_exceeds_bill WITHOUT `remaining` -- the DATABASE"
                      f" refused it (RA001); live allocations {await db.live(b3)}")

                # L2 -- the race the brief names, with the app lock gone.
                seen, over, ok = [], 0, 0
                by_layer = {"database": 0, "route": 0}
                for _ in range(5):
                    b = await unpaid_bill(client, shop)
                    gate = asyncio.Event()

                    async def go(body: dict) -> httpx.Response:
                        await gate.wait()
                        return await client.post("/payments", headers=auth(shop.tok), json=body)

                    ta = asyncio.create_task(go(payment_body(shop, "cash", "60.00", b)))
                    tb = asyncio.create_task(go(payment_body(shop, "cash", "60.00", b)))
                    await asyncio.sleep(0.05)
                    gate.set()
                    ra, rb = await ta, await tb
                    live = await db.live(b)
                    outcome = sorted([(ra.status_code, code_of(ra)), (rb.status_code, code_of(rb))], key=lambda x: x[0])
                    seen.append(f"{outcome[0][0]}/{outcome[1][0]}={live}")
                    if live > D("100.00"):
                        over += 1
                    if outcome[0][0] == 201 and outcome[1] == (422, "allocation_exceeds_bill") and live == D("60.00"):
                        ok += 1
                        loser = ra if ra.status_code == 422 else rb
                        by_layer["route" if "remaining" in loser.json().get("detail", {}) else "database"] += 1
                stripped = srv.text().count("NOLOCK: the route's bill lock stripped")
                check(over == 0, f"L2 the race with the app lock REMOVED (stripped {stripped} times): 0 overpayments"
                                 f" in 5 rounds ({seen})")
                check(ok == 5, "L2 and every round: one 201, one 422 allocation_exceeds_bill, live allocations 60.00"
                               f" -- refused by the database {by_layer['database']}, by the route's lock-less check"
                               f" {by_layer['route']} (a race is a coin; L3 is the database's refusal held)")
            finally:
                await set_separate(client, shop, False)
    finally:
        srv.stop()


async def sql_cells(db: Db, shop: Shop) -> None:
    header("S  the other doors, by SQL")
    # a 100.00 bill fully paid by the fixture (an automatic payment) -- read its ids from Postgres
    row = (await db.fetch("SELECT b.id, b.total_amount, p.id AS pid FROM purchase_bills b"
                          " JOIN payment_allocations a ON a.bill_id = b.id JOIN payments p ON p.id = a.payment_id"
                          " WHERE b.tenant_id = $1 AND b.voided_at IS NULL AND b.total_amount = 100.00"
                          " AND p.voided_at IS NULL AND p.idempotency_key LIKE 'auto:%' LIMIT 1", shop.id))[0]
    bill, pid = row["id"], row["pid"]

    async def as_app(sql: str, *args: Any, isolation: str = "read_committed") -> tuple[str | None, str]:
        c = await db.app()
        try:
            tr = c.transaction(isolation=isolation)
            await tr.start()
            try:
                await c.execute("SELECT set_config('app.tenant_id', $1, true)", str(shop.id))
                await c.execute(sql, *args)
                return None, ""
            except asyncpg.PostgresError as e:
                return getattr(e, "sqlstate", None), str(e)
            finally:
                await tr.rollback()
        finally:
            await c.close()

    extra = uuid.uuid4()
    pay_sql = ("WITH p AS (INSERT INTO payments (id, tenant_id, branch_id, seller_id, method, amount, idempotency_key,"
               " device_created_at, paid_by) VALUES ($1, $2, $3, $4, 'cash', 5.00, $5, now(), $6) RETURNING id)"
               " INSERT INTO payment_allocations (tenant_id, payment_id, bill_id, amount) SELECT $2, id, $7, 5.00 FROM p")
    args = (extra, shop.id, uuid.UUID(shop.ids["branch"]), uuid.UUID(shop.ids["seller"]), f"s1-{RUN}", shop.admin, bill)
    state, msg = await as_app(pay_sql, *args)
    check(state == "RA001" and str(bill) in msg,
          f"S1 as recycle_app: 5.00 more on a fully-paid 100.00 bill is REFUSED, RA001 naming the bill ({state}: {msg[:90]})")
    state, msg = await as_app(pay_sql, *args, isolation="repeatable_read")
    check(state == "RA002", f"S2 the same under REPEATABLE READ is RA002 -- refused, not passed ({state}: {msg[:70]})")

    su = await db.su()
    try:
        async def su_try(*stmts: tuple[str, tuple]) -> tuple[str | None, str]:
            tr = su.transaction()
            await tr.start()
            try:
                await su.execute("SELECT set_config('app.tenant_id', $1, true)", str(shop.id))
                await su.execute("SELECT set_config('app.actor_id', $1, true)", SYSTEM_ACTOR)
                await su.execute("SELECT set_config('app.actor_username', $1, true)", "system:prove_allocation_cap")
                for sql, a in stmts:
                    await su.execute(sql, *a)
                return None, ""
            except asyncpg.PostgresError as e:
                return getattr(e, "sqlstate", None), str(e)
            finally:
                await tr.rollback()

        # S3: void the automatic payment, pay the bill again in full, then make the first one live again.
        p2 = uuid.uuid4()
        state, msg = await su_try(
            ("UPDATE payments SET voided_at = now(), voided_by = $2, void_reason = 'proof' WHERE id = $1", (pid, shop.admin)),
            ("INSERT INTO payments (id, tenant_id, branch_id, seller_id, method, amount, idempotency_key,"
             " device_created_at, paid_by) VALUES ($1, $2, $3, $4, 'cash', 100.00, $5, now(), $6)",
             (p2, shop.id, uuid.UUID(shop.ids["branch"]), uuid.UUID(shop.ids["seller"]), f"s3-{RUN}", shop.admin)),
            ("INSERT INTO payment_allocations (tenant_id, payment_id, bill_id, amount) VALUES ($1, $2, $3, 100.00)",
             (shop.id, p2, bill)),
            ("UPDATE payments SET voided_at = NULL, voided_by = NULL, void_reason = NULL WHERE id = $1", (pid,)),
        )
        check(state == "RA001" and str(bill) in msg,
              f"S3 a voided payment made LIVE again over the cap is RA001 ({state}: {msg[:80]})")
        state, msg = await su_try(("UPDATE purchase_bills SET total_amount = 50.00 WHERE id = $1", (bill,)))
        check(state == "RA001" and str(bill) in msg,
              f"S4 a bill's total lowered under its live allocations is RA001 ({state}: {msg[:80]})")
        state, _ = await su_try(("UPDATE purchase_bills SET total_amount = 100.00 WHERE id = $1", (bill,)))
        check(state is None, "S4 control: the same UPDATE that keeps the total at its allocations passes")
    finally:
        await su.close()


async def main() -> int:
    ap = argparse.ArgumentParser(description="The allocation cap in the database (H4).")
    ap.add_argument("--database", default=None, help=f"a SCRATCH database. Omit to self-restore {SCRATCH_DB!r}.")
    ap.add_argument("--skip-restore", action="store_true")
    args = ap.parse_args()

    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    live_name = app_live.database
    scratch = args.database or SCRATCH_DB
    if scratch == live_name:
        print(f"REFUSED: the scratch name {scratch!r} equals the live database.")
        return 2
    if not args.skip_restore:
        print(f"  restoring scratch {scratch!r} from a live dump of {live_name!r}...")
        try:
            restore_scratch(live_name, scratch)
        except Exception as exc:  # noqa: BLE001
            print(f"REFUSED: could not restore the scratch: {exc}")
            return 2
    os.environ["APP_DATABASE_URL"] = app_live.set(database=scratch).render_as_string(hide_password=False)
    os.environ["DIRECTORY_DATABASE_URL"] = dir_live.set(database=scratch).render_as_string(hide_password=False)
    db = Db(os.environ["APP_DATABASE_URL"], scratch)

    if not await migration_cells(scratch, db):
        print("UNFIT: the scratch could not be brought to head")
        return 2

    shop = Shop()
    srv = Server(nolock=False)
    try:
        why = srv.wait()
        if why:
            check(False, f"E0 the server started -- {why}")
            return 1
        await provision(shop)
        async with httpx.AsyncClient(base_url=srv.base, timeout=60.0) as client:
            r = await client.post("/auth/login", json={"tenant_id": str(shop.id), "username": shop.name, "password": shop.pw})
            shop.tok = r.json().get("access_token", "") if r.status_code == 200 else ""
            check(bool(shop.tok), "E1 the per-run admin signs in")
            await build(client, shop)
            await normal_cells(client, db, shop)
    finally:
        srv.stop()
    await nolock_cells(db, shop)
    await sql_cells(db, shop)

    print("\n" + "=" * 72)
    print(f"  passes={len(passes)}  failures={len(failures)}")
    for f in failures:
        print(f"    RED: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--serve-nolock":
        serve_nolock(int(sys.argv[2]))
        sys.exit(0)
    rc = asyncio.run(main())
    print(f"PROVE_ALLOCATION_CAP_EXIT={rc}")
    sys.exit(rc)
