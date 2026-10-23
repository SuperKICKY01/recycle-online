"""H2 (ADVISOR-DECIDED 2026-10-23): MONEY UNDER FAULTS, over real HTTP on a scratch.

Model on prove_tenant_matrix.py: restore a SCRATCH from a live dump, start a child uvicorn, provision
ONE throwaway shop by SQL (tenant, born-with branch, the three system roles, an owner and an admin --
per-run names and passwords, none printed) and build its master data through the API. Every figure a
cell expects is FIXED FROM THIS PROOF'S OWN INPUTS before the write, then read back out of Postgres as
the superuser (RLS-free, so nothing is hidden from the reader) and compared value against value.

WHAT EXISTED BEFORE THIS FILE (measured 2026-10-23, read from the files) and what this file adds:
  - one key replayed once / two concurrent copies: prove_bills.py CASE 2, CASE 8 (and prove_payments.py
    R1/R2). ADDED here, F1: the same body 100 times under ONE key, 50 released together then 50 in
    sequence -- exactly one 201, one bill, one payment, one allocation, one doc_no, and the branch's
    counter at that number (no number burned by the 99).
  - the same key with a DIFFERENT body: not covered anywhere. ADDED, F2: today the second body is
    DISCARDED and the FIRST bill answered (200) -- same id, same total, nothing written, the first
    bill's rows value-equal before and after. Stated as what happens, not as a choice.
  - a response lost after COMMIT: covered only against fakes (mobile proveSync CASE 3, LostAckTransport).
    ADDED, F3: the REAL server killed after the bill's transaction committed and before it answered
    (this script re-executes itself with --serve-hold, which holds create_bill's connection AFTER its
    commit while a flag file exists; the commit is read in Postgres, the request is shown still
    unanswered, then the process is killed); a NEW server answers the retry 200 with the same bill.
  - the same payment twice concurrently: prove_payments.py P8/P9 (replay) and P10 (two concurrent
    submits, one row) -- not repeated here. ADDED, F6: two DIFFERENT payments for one bill whose sum
    exceeds it. RH holds the route's lock (the bill row FOR NO KEY UPDATE) and the payment WAITS, its
    waiter named from pg_stat_activity as the superuser; the negative half holds FOR KEY SHARE (what an
    in-flight child INSERT takes) and the payment does NOT wait; a control holds nothing. RB releases
    the two together, five rounds: one 201, one 422 allocation_exceeds_bill, live allocations 60.00 of
    100.00 (a count that must hold under every interleaving -- the lock itself is RH's).
  - a payment racing a shift close: prove_drawer.py RH1/RH1b/RH1n, RH2/RH2b/RH2c, RH3 (held) and
    RB1-RB4 (released together) -- not repeated here.
  - two devices with overlapping outboxes, and a phone killed mid-sync: mobile `npm run prove:syncfaults`
    (the real SyncEngine, SQLite store and HttpTransport against a real server).
  - RECONCILIATION, F7: two shifts of mixed traffic (automatic cash, a separated counter paying by
    transfer and in cash, a partial, an advance, a voided bill whose payment stands, a float in and an
    expense, a remainder paid in the NEXT shift). Per shift, from the rows: bills' amounts against the
    allocations of the payments stamped in it, the payments by method against the inputs, and the
    drawer's expected cash three ways (inputs, rows, what the close stored and answered). Every
    difference between "bills" and "allocations" must fall in a NAMED category (partial remainder,
    advance, a voided bill's payment, paid in another shift); an unnamed difference is red.

THE DISPROOFS, RUN BY HAND (2026-10-23), each mutation read back present before its run:
  - bills.py create_bill, the two idempotency sites (the pre-read by key; the IntegrityError
    handler's re-read). The pre-read ALONE disabled: all green -- the handler answers every replay
    and no number is burned. The re-read ALONE disabled: F1 red, 14 of the 50 released together
    answered 500 (a coin, not a cell). BOTH disabled: F1 red (99 x 500), all three F2 variants red,
    the F3 retry red. In every arm Postgres still held ONE bill per key: the per-shop unique key is
    what refuses the duplicate; the two sites turn that refusal into "already created".
  - payments.py create_payment: `FOR NO KEY UPDATE` on the bill row removed -> RH1 red (completed
    1.53 s BEFORE the release), RH1b red (no waiter), and RB red: 4 of 5 rounds accepted BOTH
    60.00 payments against the 100.00 bill. Nothing in the schema stops that over-allocation; the
    lock is the only guard (OPEN_ITEMS, Code debt).
  - shifts.py _drawer_figure: cash payments no longer subtracted -> F7 red in both shifts: stored and
    answered 1185.00 against inputs and rows 962.50 (S1), 100.00 against 60.00 (S2).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
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
SCRATCH_DB = scratch_name("recycle_money_faults_scratch")
RUN = uuid.uuid4().hex[:8]
HOLD_FLAG = os.path.join(tempfile.gettempdir(), f"recycle-money-faults-hold-{RUN}")
D = Decimal
C2 = Decimal("0.01")

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
    out = os.path.join(tempfile.gettempdir(), f"recycle-faults-dump-{RUN}")
    label = f"faults-{RUN}"
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "backup_db.py"),
         "--db", live_name, "--out", out, "--label", label],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py (live) failed: {cp.stderr.strip()[:600]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    if len(dumps) != 1:
        raise RuntimeError(f"expected one dump dir ending {label!r}, got {dumps}")
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "restore_db.py"),
         os.path.join(out, dumps[0]), "--into", scratch],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py -> {scratch} failed: {cp.stderr.strip()[:600]}")
    shutil.rmtree(out, ignore_errors=True)


class Server:
    def __init__(self, *, hold: bool) -> None:
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_money_faults_",
                                               delete=False, encoding="utf-8")
        if hold:
            argv = [sys.executable, "-u", os.path.abspath(__file__), "--serve-hold", str(self.port)]
        else:
            argv = [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
                    "--host", "127.0.0.1", "--port", str(self.port), "--log-level", "warning"]
        env = dict(os.environ)
        env["MONEY_FAULTS_HOLD_FLAG"] = HOLD_FLAG
        self.proc = subprocess.Popen(argv, cwd=SERVER_DIR, env=env, stdout=self.log, stderr=subprocess.STDOUT)

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

    def kill(self) -> None:
        """TerminateProcess on Windows: no shutdown hook runs, exactly a server that died."""
        self.proc.kill()
        self.proc.wait(timeout=15)

    def stop(self) -> None:
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.log.close()
        try:
            os.unlink(self.log.name)
        except OSError:
            pass


def serve_hold(port: int) -> None:
    """The F3 child: today's app, with create_bill's connection HELD AFTER its transaction committed
    while the flag file exists -- so the bill is in Postgres and no response has been written. Only
    the name app.bills looks up at call time is wrapped; get_principal (app.auth) is untouched."""
    import app.bills as bills
    import uvicorn
    original = bills.tenant_connection
    flag = os.environ["MONEY_FAULTS_HOLD_FLAG"]

    @asynccontextmanager
    async def held(*args: Any, **kwargs: Any):
        async with original(*args, **kwargs) as conn:
            yield conn
        if os.path.exists(flag):
            print("HOLD: committed; holding the response", flush=True)
            await asyncio.sleep(120)

    bills.tenant_connection = held
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="warning")


# ---------------------------------------------------------------------------
# Postgres as the SUPERUSER (prove_drawer.py's seat): RLS-free reads and lock holds
# ---------------------------------------------------------------------------
class Db:
    def __init__(self, url: str, scratch: str) -> None:
        u = make_url(url)
        self.host, self.port, self.scratch = u.host, u.port, scratch

    async def su(self) -> asyncpg.Connection:
        return await asyncpg.connect(host=self.host, port=self.port, user="postgres",
                                     password="postgres", database=self.scratch)

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

    async def bill_state(self, bill_id: str) -> tuple:
        """Every row a bill owns, as text: header, lines, its payments' allocations and payments."""
        b = uuid.UUID(bill_id)
        head = await self.fetch("SELECT row_to_json(x)::text FROM purchase_bills x WHERE id = $1", b)
        items = await self.fetch("SELECT row_to_json(x)::text FROM purchase_bill_items x WHERE bill_id = $1"
                                 " ORDER BY 1", b)
        allocs = await self.fetch("SELECT row_to_json(x)::text FROM payment_allocations x WHERE bill_id = $1"
                                  " ORDER BY 1", b)
        pays = await self.fetch("SELECT row_to_json(p)::text FROM payments p WHERE p.id IN"
                                " (SELECT payment_id FROM payment_allocations WHERE bill_id = $1) ORDER BY 1", b)
        return (tuple(r[0] for r in head), tuple(r[0] for r in items), tuple(r[0] for r in allocs),
                tuple(r[0] for r in pays))

    async def waiting(self) -> list[str]:
        rows = await self.fetch("SELECT query FROM pg_stat_activity WHERE datname = $1"
                                " AND wait_event_type = 'Lock'", self.scratch)
        return [" ".join((r["query"] or "").split()) for r in rows]


# ---------------------------------------------------------------------------
# fixture: one shop
# ---------------------------------------------------------------------------
class Shop:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.owner, self.admin = uuid.uuid4(), uuid.uuid4()
        self.names = {"owner": f"owner-mf-{RUN}", "admin": f"admin-mf-{RUN}"}
        self.pw = {k: f"pw-{k}-mf-{RUN}" for k in self.names}
        self.tok = ""
        self.ids: dict[str, str] = {}


async def provision(shop: Shop) -> None:
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.permissions import seed_system_roles
    from app.security import hash_password

    async with tenant_connection(shop.id, actor_id=SYSTEM_ACTOR_ID,
                                 actor_username="system:prove_money_faults") as conn:
        await conn.execute(text("INSERT INTO tenants (id, name) VALUES (:id, :n)"),
                           {"id": shop.id, "n": f"MF {RUN}"})
        await conn.execute(
            text("INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                 " VALUES (:t, 'MAIN', :n, 'B', true)"),
            {"t": shop.id, "n": f"MF {RUN}"})
        roles = await seed_system_roles(conn, shop.id)
        for key, uid in (("owner", shop.owner), ("admin", shop.admin)):
            await conn.execute(
                text("INSERT INTO users (id, tenant_id, username, full_name, role_id, password_hash)"
                     " VALUES (:id, :t, :u, :fn, :r, :ph)"),
                {"id": uid, "t": shop.id, "u": shop.names[key], "fn": shop.names[key],
                 "r": roles[key], "ph": await hash_password(shop.pw[key])})


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def build(client: httpx.AsyncClient, shop: Shop) -> None:
    async def call(method: str, path: str, body: Any = None) -> dict:
        r = await client.request(method, path, headers=auth(shop.tok), json=body)
        if r.status_code not in (200, 201):
            raise RuntimeError(f"fixture: {method} {path} -> {r.status_code} {r.text[:300]}")
        return r.json()

    s = shop.ids
    s["branch"] = (await call("GET", "/shop"))["branch"]["id"]
    await call("POST", "/grade-tiers", {"code": "A", "name": "เกรด A"})
    s["uom"] = (await call("POST", "/uoms", {"code": "KG", "name": "กิโลกรัม"}))["id"]
    s["cat"] = (await call("POST", "/product-categories", {"code": "FE", "name": "เหล็ก"}))["id"]
    s["product"] = (await call("POST", "/products", {"code": "FE01", "name": "เหล็กหนา",
                                                      "category_id": s["cat"], "uom_id": s["uom"]}))["id"]
    await call("PUT", f"/products/{s['product']}/prices/A", {"price": "10.00"})
    s["seller"] = (await call("POST", "/sellers", {"name": f"ผู้ขาย {RUN}"}))["id"]
    s["seller2"] = (await call("POST", "/sellers", {"name": f"ผู้ขายสอง {RUN}"}))["id"]
    s["channel"] = (await call("POST", "/shop/payment-channels", {
        "kind": "bank_account", "label": "บัญชีร้าน", "bank_code": "004",
        "account_no": f"55{int(RUN, 16) % 10**8:08d}", "account_name": "ร้าน"}))["id"]


def bill_body(shop: Shop, net: str, *, seller: str | None = None, key: str | None = None,
              bill_id: str | None = None) -> dict:
    return {"id": bill_id or str(uuid.uuid4()), "seller_id": seller or shop.ids["seller"],
            "device_created_at": now_iso(), "idempotency_key": key or f"mf-{uuid.uuid4()}",
            "items": [{"id": str(uuid.uuid4()), "product_id": shop.ids["product"], "line_no": 1,
                       "gross_weight": net, "tare_weight": "0.000", "net_weight": net, "unit_price": "10.00"}]}


def payment_body(shop: Shop, method: str, amount: str, allocations: list[tuple[str, str]], **extra: Any) -> dict:
    return {"id": str(uuid.uuid4()), "seller_id": shop.ids["seller"], "method": method, "amount": amount,
            "idempotency_key": f"mfp-{uuid.uuid4()}", "device_created_at": now_iso(),
            "allocations": [{"bill_id": b, "amount": a} for b, a in allocations], **extra}


def code_of(r: httpx.Response) -> str | None:
    try:
        d = r.json().get("detail")
    except ValueError:
        return None
    return d.get("code") if isinstance(d, dict) else None


async def counter_seq(db: Db, shop: Shop) -> int:
    return int(await db.fetchval("SELECT coalesce(max(last_seq), 0) FROM doc_no_counters WHERE tenant_id = $1",
                                 shop.id) or 0)


async def bills_with_key(db: Db, shop: Shop, key: str) -> int:
    return int(await db.fetchval("SELECT count(*) FROM purchase_bills WHERE tenant_id = $1 AND idempotency_key = $2",
                                 shop.id, key))


async def set_separate(client: httpx.AsyncClient, shop: Shop, on: bool) -> None:
    r = await client.patch(f"/branches/{shop.ids['branch']}", headers=auth(shop.tok), json={"separate_cashier": on})
    if r.status_code != 200:
        raise RuntimeError(f"PATCH /branches separate_cashier={on} -> {r.status_code} {r.text[:200]}")


# ---------------------------------------------------------------------------
# F1, F2: one key
# ---------------------------------------------------------------------------
async def f1_hundred(base: str, db: Db, shop: Shop) -> dict:
    header("F1  the SAME bill POSTed 100 times under ONE key: 50 released together, then 50 in sequence")
    body = bill_body(shop, "10.000")
    seq_before = await counter_seq(db, shop)
    limits = httpx.Limits(max_connections=60, max_keepalive_connections=60)
    async with httpx.AsyncClient(base_url=base, timeout=120.0, limits=limits) as c:
        gate = asyncio.Event()

        async def one() -> httpx.Response:
            await gate.wait()
            return await c.post("/bills", headers=auth(shop.tok), json=body)

        tasks = [asyncio.create_task(one()) for _ in range(50)]
        await asyncio.sleep(0.2)
        gate.set()
        together = await asyncio.gather(*tasks)
        after = [await c.post("/bills", headers=auth(shop.tok), json=body) for _ in range(50)]
    rs = together + after
    statuses: dict[int, int] = {}
    for r in rs:
        statuses[r.status_code] = statuses.get(r.status_code, 0) + 1
    answers = {(r.json().get("id"), r.json().get("doc_no"), r.json().get("total_amount"))
               for r in rs if r.status_code in (200, 201)}
    check(statuses.get(201) == 1 and statuses.get(200) == 99,
          f"F1: 100 POSTs -> exactly one 201 and 99 x 200, no other status ({statuses})")
    check(len(answers) == 1, f"F1: all 100 answers name ONE bill, one doc_no, one total ({answers})")
    n = await bills_with_key(db, shop, body["idempotency_key"])
    pays = await db.fetch("SELECT p.id, p.amount, p.method FROM payments p WHERE p.tenant_id = $1"
                          " AND p.idempotency_key = $2", shop.id, f"auto:{body['id']}")
    allocs = await db.fetch("SELECT amount FROM payment_allocations WHERE bill_id = $1", uuid.UUID(body["id"]))
    check(n == 1, f"F1: Postgres holds ONE bill under the key (found {n})")
    check(len(pays) == 1 and len(allocs) == 1 and D(pays[0]["amount"]) == D("100.00") == D(allocs[0]["amount"]),
          f"F1: ONE automatic cash payment of 100.00 and ONE allocation of 100.00"
          f" ({[(str(p['amount']), p['method']) for p in pays]} / {[str(a['amount']) for a in allocs]})")
    doc = next(iter(answers))[1] if answers else ""
    seq_after = await counter_seq(db, shop)
    check(seq_after == seq_before + 1 and doc.endswith(f"-{seq_after}"),
          f"F1: the branch counter moved by exactly one, to the bill's own number ({seq_before} -> {seq_after},"
          f" doc_no {doc}): none of the 99 burned a number")
    return body


async def f2_different_body(client: httpx.AsyncClient, db: Db, shop: Shop, original: dict) -> None:
    header("F2  the same key with a DIFFERENT body -- what happens today")
    before = await db.bill_state(original["id"])
    seq_before = await counter_seq(db, shop)
    key = original["idempotency_key"]
    variants = [
        ("same id, different weight (200.00 instead of 100.00)",
         bill_body(shop, "20.000", key=key, bill_id=original["id"])),
        ("a different bill id, same lines", bill_body(shop, "10.000", key=key)),
        ("a different id, a different seller and amount", bill_body(shop, "7.000", key=key, seller=shop.ids["seller2"])),
    ]
    for label, body in variants:
        r = await client.post("/bills", headers=auth(shop.tok), json=body)
        j = r.json() if r.status_code in (200, 201) else {}
        print(f"      {label}: {r.status_code} id={'ORIGINAL' if j.get('id') == original['id'] else j.get('id')}"
              f" total={j.get('total_amount')} doc_no={j.get('doc_no')}")
        check(r.status_code == 200 and j.get("id") == original["id"] and j.get("total_amount") == "100.00",
              f"F2 [{label}]: answered 200 with the FIRST bill (id and total 100.00) -- the new body discarded")
        if body["id"] != original["id"]:
            n_new = await db.fetchval("SELECT count(*) FROM purchase_bills WHERE id = $1", uuid.UUID(body["id"]))
            check(n_new == 0, f"F2 [{label}]: no bill exists under the new id (found {n_new})")
    check(await bills_with_key(db, shop, key) == 1, "F2: still ONE bill under the key")
    after = await db.bill_state(original["id"])
    check(after == before, "F2: the first bill's header, lines, allocations and payment are value-equal in Postgres"
                           " before and after -- not silently changed")
    check(await counter_seq(db, shop) == seq_before, "F2: no doc_no number consumed by the three")
    print("      TODAY: a repeated key with a different body is answered 200 with the ORIGINAL bill; the server"
          " neither refuses nor flags the difference. Nothing is written. The phone mints one key per bill"
          " (mobile/src/sync/createBill.ts) and replays the stored body unchanged.")


# ---------------------------------------------------------------------------
# F3: the server dies between commit and response
# ---------------------------------------------------------------------------
async def f3_killed_after_commit(db: Db, shop: Shop) -> Server:
    header("F3  the server is KILLED after the bill committed and before it answered; the client retries")
    held = Server(hold=True)
    why = held.wait()
    if why:
        check(False, f"F3: the holding server started -- {why}")
        return Server(hold=False)
    body = bill_body(shop, "4.500")
    open(HOLD_FLAG, "w").close()
    try:
        async with httpx.AsyncClient(base_url=held.base, timeout=150.0) as c:
            task = asyncio.create_task(c.post("/bills", headers=auth(shop.tok), json=body))
            committed = False
            for _ in range(200):
                await asyncio.sleep(0.1)
                if await db.fetchval("SELECT count(*) FROM purchase_bills WHERE id = $1", uuid.UUID(body["id"])):
                    committed = True
                    break
            await asyncio.sleep(0.3)
            unanswered = not task.done()
            check(committed and unanswered,
                  f"F3: the bill is COMMITTED in Postgres ({committed}) and the request is still UNANSWERED"
                  f" ({unanswered})")
            held.kill()
            try:
                r = await task
                outcome = f"a response {r.status_code}"
            except httpx.HTTPError as exc:
                outcome = f"no response: {type(exc).__name__}"
            check(outcome.startswith("no response"), f"F3: the client got {outcome} -- the response was lost")
    finally:
        try:
            os.unlink(HOLD_FLAG)
        except OSError:
            pass
        held.stop()
    fresh = Server(hold=False)
    why = fresh.wait()
    if why:
        check(False, f"F3: a fresh server started -- {why}")
        return fresh
    async with httpx.AsyncClient(base_url=fresh.base, timeout=60.0) as c:
        r = await c.post("/bills", headers=auth(shop.tok), json=body)
    j = r.json() if r.status_code in (200, 201) else {}
    row = (await db.fetch("SELECT doc_no, total_amount FROM purchase_bills WHERE id = $1", uuid.UUID(body["id"])))
    check(r.status_code == 200 and j.get("id") == body["id"] and row and j.get("doc_no") == row[0]["doc_no"],
          f"F3: the RETRY on a new server is 200 with the committed bill (doc_no {j.get('doc_no')}, Postgres"
          f" {row[0]['doc_no'] if row else None})")
    n = await bills_with_key(db, shop, body["idempotency_key"])
    pays = await db.fetchval("SELECT count(*) FROM payments WHERE tenant_id = $1 AND idempotency_key = $2",
                             shop.id, f"auto:{body['id']}")
    allocs = await db.fetchval("SELECT count(*) FROM payment_allocations WHERE bill_id = $1", uuid.UUID(body["id"]))
    check(n == 1 and pays == 1 and allocs == 1 and j.get("paid_amount") == "45.00",
          f"F3: one bill, one payment, one allocation, paid 45.00 (bills={n} payments={pays} allocations={allocs})")
    return fresh


# ---------------------------------------------------------------------------
# F6: two different payments for one bill
# ---------------------------------------------------------------------------
async def unpaid_bill(client: httpx.AsyncClient, shop: Shop) -> str:
    body = bill_body(shop, "10.000")
    r = await client.post("/bills", headers=auth(shop.tok), json=body)
    if r.status_code != 201 or r.json().get("payment_status") != "unpaid":
        raise RuntimeError(f"an unpaid bill: {r.status_code} {r.text[:200]}")
    return body["id"]


async def f6_payments(client: httpx.AsyncClient, db: Db, shop: Shop) -> None:
    header("F6  two DIFFERENT payments for one bill: the bill row lock HELD (RH), then released together (RB)")
    await set_separate(client, shop, True)
    try:
        HOLD = 1.5

        async def held_run(mode: str | None) -> tuple[float, float, list[str], httpx.Response]:
            bill = await unpaid_bill(client, shop)
            su = await db.su()
            tr = su.transaction()
            await tr.start()
            try:
                if mode:
                    await su.execute(f"SELECT id FROM purchase_bills WHERE id = $1 {mode}", uuid.UUID(bill))
                t0 = time.monotonic()

                async def timed() -> tuple[httpx.Response, float]:
                    r = await client.post("/payments", headers=auth(shop.tok),
                                          json=payment_body(shop, "cash", "60.00", [(bill, "60.00")]))
                    return r, time.monotonic()

                task = asyncio.create_task(timed())
                await asyncio.sleep(0.8)
                waiters = await db.waiting()
                await asyncio.sleep(HOLD - 0.8)
                released = time.monotonic()
            finally:
                await tr.rollback()
                await su.close()
            r, done = await task
            return done - t0, done - released, waiters, r

        took, after_release, waiters, r = await held_run(None)
        check(r.status_code == 201 and took < 1.0,
              f"RH0 control: nothing held -> 201 in {took:.2f}s")
        took, after_release, waiters, r = await held_run("FOR NO KEY UPDATE")
        named = [w for w in waiters if "purchase_bills" in w and "FOR NO KEY UPDATE" in w]
        check(r.status_code == 201 and took >= HOLD - 0.1 and after_release >= 0,
              f"RH1: the bill row held FOR NO KEY UPDATE (a second payment's mode) -> the payment WAITED:"
              f" completed {took:.2f}s after it was sent, {after_release:.2f}s after the release")
        check(bool(named), f"RH1b: pg_stat_activity (superuser) names the waiter: the route's own"
                           f" `FROM purchase_bills ... FOR NO KEY UPDATE` ({len(named)} of {len(waiters)} waiting)")
        took, after_release, waiters, r = await held_run("FOR KEY SHARE")
        check(r.status_code == 201 and after_release < 0,
              f"RH1n NEGATIVE HALF: held FOR KEY SHARE (an in-flight child INSERT's FK lock) -> the payment did"
              f" NOT wait: completed {took:.2f}s after sending, {-after_release:.2f}s BEFORE the release")

        rounds = 5
        seen: list[str] = []
        ok_rounds = 0
        for i in range(rounds):
            bill = await unpaid_bill(client, shop)
            a = payment_body(shop, "cash", "60.00", [(bill, "60.00")])
            b = payment_body(shop, "transfer", "60.00", [(bill, "60.00")], channel_id=shop.ids["channel"])
            gate = asyncio.Event()

            async def go(body: dict) -> httpx.Response:
                await gate.wait()
                return await client.post("/payments", headers=auth(shop.tok), json=body)

            ta, tb = asyncio.create_task(go(a)), asyncio.create_task(go(b))
            await asyncio.sleep(0.05)
            gate.set()
            ra, rb = await ta, await tb
            live = D(await db.fetchval(
                "SELECT coalesce(sum(x.amount), 0) FROM payment_allocations x JOIN payments p ON p.id = x.payment_id"
                " WHERE x.bill_id = $1 AND p.voided_at IS NULL", uuid.UUID(bill)))
            codes = sorted([(ra.status_code, code_of(ra)), (rb.status_code, code_of(rb))], key=lambda t: t[0])
            seen.append(f"{codes[0][0]}/{codes[1][0]}")
            if codes[0][0] == 201 and codes[1] == (422, "allocation_exceeds_bill") and live == D("60.00"):
                ok_rounds += 1
        check(ok_rounds == rounds,
              f"RB: {rounds} rounds of 60.00 + 60.00 against a 100.00 bill released together -> every round ONE 201,"
              f" ONE 422 allocation_exceeds_bill, live allocations 60.00 ({seen})")
    finally:
        await set_separate(client, shop, False)


# ---------------------------------------------------------------------------
# F7: reconciliation per shift
# ---------------------------------------------------------------------------
async def f7_reconcile(client: httpx.AsyncClient, db: Db, shop: Shop) -> None:
    header("F7  RECONCILIATION per shift: bills' amounts = payments' allocations = the drawer, differences NAMED")
    h = auth(shop.tok)

    async def post(path: str, body: Any, want: int = 201) -> dict:
        r = await client.post(path, headers=h, json=body)
        if r.status_code != want:
            raise RuntimeError(f"F7: POST {path} -> {r.status_code} {r.text[:300]}")
        return r.json()

    # THE INPUTS, and every figure they imply, fixed BEFORE a single write.
    s1, s2 = str(uuid.uuid4()), str(uuid.uuid4())
    want = {
        s1: {"opening": D("1000.00"), "cash": D("222.50"), "transfer": D("120.00"), "float_in": D("200.00"),
             "out": D("15.00"), "expected": D("962.50"), "counted": D("957.50"), "variance": D("-5.00")},
        s2: {"opening": D("100.00"), "cash": D("40.00"), "transfer": D("30.00"), "float_in": D("0.00"),
             "out": D("0.00"), "expected": D("60.00"), "counted": D("60.00"), "variance": D("0.00")},
    }
    # The DIFFERENCES the inputs make, by category, fixed in advance: a reconciler that named nothing
    # would pass every equality below vacuously.
    want_named = {s1: {"advance", "voided bill", "paid in another shift"},
                  s2: {"paid in another shift", "partial"}}
    await post("/shifts", {"id": s1, "opening_float": "1000.00"})
    b1 = await post("/bills", bill_body(shop, "10.000"))            # 100.00, automatic cash
    b2 = await post("/bills", bill_body(shop, "3.750"))             # 37.50, automatic cash
    await set_separate(client, shop, True)
    b3 = await post("/bills", bill_body(shop, "12.000"))            # 120.00, unpaid
    b4 = await post("/bills", bill_body(shop, "8.000"))             # 80.00, unpaid
    await post("/payments", payment_body(shop, "transfer", "120.00", [(b3["id"], "120.00")],
                                         channel_id=shop.ids["channel"]))
    await post("/payments", payment_body(shop, "cash", "50.00", [(b4["id"], "50.00")]))      # partial
    adv = await post("/payments", payment_body(shop, "cash", "25.00", []))                   # an advance
    await set_separate(client, shop, False)
    b5 = await post("/bills", bill_body(shop, "1.000"))             # 10.00, automatic cash ...
    await post(f"/bills/{b5['id']}/void", {"reason": f"ชั่งผิด {RUN}"}, want=200)             # ... then voided
    await post("/cash-movements", {"id": str(uuid.uuid4()), "kind": "float_in", "amount": "200.00",
                                   "idempotency_key": f"mfm-{uuid.uuid4()}", "device_created_at": now_iso()})
    await post("/cash-movements", {"id": str(uuid.uuid4()), "kind": "expense", "amount": "15.00",
                                   "idempotency_key": f"mfm-{uuid.uuid4()}", "device_created_at": now_iso()})
    close1 = await post(f"/shifts/{s1}/close", {"counted_cash": "957.50"}, want=200)
    await post("/shifts", {"id": s2, "opening_float": "100.00"})
    b6 = await post("/bills", bill_body(shop, "2.000"))             # 20.00, automatic cash
    await post("/payments", payment_body(shop, "transfer", "30.00", [(b4["id"], "30.00")],
                                         channel_id=shop.ids["channel"]))                    # b4's remainder
    await set_separate(client, shop, True)
    b7 = await post("/bills", bill_body(shop, "5.000"))             # 50.00, unpaid ...
    await post("/payments", payment_body(shop, "cash", "20.00", [(b7["id"], "20.00")]))      # ... 20.00 of it
    await set_separate(client, shop, False)
    close2 = await post(f"/shifts/{s2}/close", {"counted_cash": "60.00"}, want=200)
    closes = {s1: close1, s2: close2}
    names = {b1["id"]: "b1", b2["id"]: "b2", b3["id"]: "b3", b4["id"]: "b4", b5["id"]: "b5", b6["id"]: "b6",
             b7["id"]: "b7"}

    for sid, label in ((s1, "S1"), (s2, "S2")):
        w = want[sid]
        shift = (await db.fetch("SELECT opening_float, expected_cash, counted_cash, variance FROM shifts"
                                " WHERE id = $1", uuid.UUID(sid)))[0]
        pays = await db.fetch("SELECT id, method, amount FROM payments WHERE shift_id = $1 AND voided_at IS NULL",
                              uuid.UUID(sid))
        mv = await db.fetch("SELECT kind, amount FROM cash_movements WHERE shift_id = $1 AND voided_at IS NULL",
                            uuid.UUID(sid))
        allocs = await db.fetch(
            "SELECT x.payment_id, x.bill_id, x.amount FROM payment_allocations x"
            " JOIN payments p ON p.id = x.payment_id WHERE p.shift_id = $1 AND p.voided_at IS NULL", uuid.UUID(sid))
        by_method: dict[str, Decimal] = {}
        for p in pays:
            by_method[p["method"]] = by_method.get(p["method"], D("0")) + D(p["amount"])
        paid_total = sum((D(p["amount"]) for p in pays), D("0"))
        alloc_total = sum((D(a["amount"]) for a in allocs), D("0"))
        alloc_by_pay: dict[Any, Decimal] = {}
        alloc_by_bill: dict[str, Decimal] = {}
        for a in allocs:
            alloc_by_pay[a["payment_id"]] = alloc_by_pay.get(a["payment_id"], D("0")) + D(a["amount"])
            alloc_by_bill[str(a["bill_id"])] = alloc_by_bill.get(str(a["bill_id"]), D("0")) + D(a["amount"])
        named: list[str] = []
        unnamed: list[str] = []
        advances = D("0")
        for p in pays:
            gap = D(p["amount"]) - alloc_by_pay.get(p["id"], D("0"))
            if gap > 0:
                advances += gap
                named.append(f"advance: payment {str(p['id'])[:8]} {p['method']} {gap} allocated to no bill")
            elif gap < 0:
                unnamed.append(f"payment {p['id']} allocates {-gap} MORE than its amount")
        advances = advances.quantize(C2)
        bills_total = here_live = elsewhere_sum = owed_sum = D("0.00")
        for bid, here in sorted(alloc_by_bill.items(), key=lambda kv: names.get(kv[0], kv[0])):
            b = (await db.fetch("SELECT total_amount, voided_at FROM purchase_bills WHERE id = $1", uuid.UUID(bid)))[0]
            elsewhere = D(await db.fetchval(
                "SELECT coalesce(sum(x.amount), 0) FROM payment_allocations x JOIN payments p ON p.id = x.payment_id"
                " WHERE x.bill_id = $1 AND p.voided_at IS NULL AND p.shift_id IS DISTINCT FROM $2",
                uuid.UUID(bid), uuid.UUID(sid)))
            total = D(b["total_amount"])
            nm = names.get(bid, bid[:8])
            if b["voided_at"] is not None:
                named.append(f"voided bill: {nm} {total} voided, its payment of {here} stands (an advance to the seller)")
                continue
            bills_total += total
            remainder = total - here - elsewhere
            here_live += here
            elsewhere_sum += elsewhere
            owed_sum += max(remainder, D("0"))
            if elsewhere > 0:
                named.append(f"paid in another shift: {nm} {total} = {here} here + {elsewhere} elsewhere")
            if remainder > 0:
                named.append(f"partial: {nm} {total}, {here + elsewhere} paid so far, {remainder} still owed")
            elif remainder < 0:
                unnamed.append(f"bill {nm} is OVER-allocated by {-remainder}")
        live_alloc = sum((v for k, v in alloc_by_bill.items()), D("0"))
        cash_in = sum((D(m["amount"]) for m in mv if m["kind"] == "float_in"), D("0"))
        cash_out = sum((D(m["amount"]) for m in mv if m["kind"] != "float_in"), D("0"))
        rows_expected = (D(shift["opening_float"]) + cash_in - cash_out - by_method.get("cash", D("0"))).quantize(C2)
        print(f"\n  {label}: opening {shift['opening_float']}  payments {paid_total} ="
              f" cash {by_method.get('cash', D('0'))} + transfer {by_method.get('transfer', D('0'))}"
              f" + other {paid_total - by_method.get('cash', D('0')) - by_method.get('transfer', D('0'))}")
        print(f"      allocations {alloc_total} + advances {advances} = payments {paid_total};"
              f" live bills allocated here total {bills_total}")
        print(f"      drawer: inputs {w['expected']}  rows {rows_expected}  stored {shift['expected_cash']}"
              f"  close answered {closes[sid].get('expected_cash')}  counted {shift['counted_cash']}"
              f"  variance {shift['variance']}")
        for n in named:
            print(f"      NAMED  {n}")
        for n in unnamed:
            print(f"      UNNAMED {n}")
        check(alloc_total + advances == paid_total and live_alloc == alloc_total,
              f"F7 {label}: allocations {alloc_total} + advances {advances} == payments {paid_total}, to the cent")
        check(bills_total == here_live + elsewhere_sum + owed_sum,
              f"F7 {label}: live bills' amounts {bills_total} == allocated here {here_live} + in other shifts"
              f" {elsewhere_sum} + still owed {owed_sum}, to the cent")
        check(by_method.get("cash", D("0")) == w["cash"] and by_method.get("transfer", D("0")) == w["transfer"],
              f"F7 {label}: the split by method equals the inputs (cash {w['cash']}, transfer {w['transfer']})")
        check(rows_expected == w["expected"] == D(shift["expected_cash"]) == D(closes[sid]["expected_cash"]),
              f"F7 {label}: the drawer's expected cash agrees four ways -- inputs, rows, stored, answered ({w['expected']})")
        check(D(shift["counted_cash"]) == w["counted"] and D(shift["variance"]) == w["variance"],
              f"F7 {label}: counted {w['counted']}, variance {w['variance']} as entered")
        check(not unnamed, f"F7 {label}: every difference between bills and allocations is NAMED"
                           + (f" -- UNNAMED {unnamed}" if unnamed else f" ({len(named)} named)"))
        got = {n.split(":")[0] for n in named}
        check(got == want_named[sid], f"F7 {label}: the named categories are exactly the ones the inputs make"
                                      f" ({sorted(got)} vs {sorted(want_named[sid])})")
    print()


async def main() -> int:
    ap = argparse.ArgumentParser(description="Money under faults (H2).")
    ap.add_argument("--database", default=None,
                    help=f"a SCRATCH database. Omit to self-restore {SCRATCH_DB!r}. Never live.")
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
    shop = Shop()

    srv = Server(hold=False)
    print(f"  child uvicorn pid={srv.proc.pid} on {srv.base} against scratch {scratch!r}")
    try:
        why = srv.wait()
        if why:
            check(False, f"E0: server started -- {why}")
            return 1
        try:
            await provision(shop)
        except Exception as exc:  # noqa: BLE001
            print(f"UNFIT: provisioning failed: {exc!r}")
            return 2
        async with httpx.AsyncClient(base_url=srv.base, timeout=60.0) as client:
            r = await client.post("/auth/login", json={"tenant_id": str(shop.id), "username": shop.names["admin"],
                                                       "password": shop.pw["admin"]})
            shop.tok = r.json().get("access_token", "") if r.status_code == 200 else ""
            check(bool(shop.tok), "E1: the per-run admin signs in")
            try:
                await build(client, shop)
            except Exception as exc:  # noqa: BLE001
                print(f"UNFIT: {exc}")
                return 2
            print(f"      shop={shop.id}")
            original = await f1_hundred(srv.base, db, shop)
            await f2_different_body(client, db, shop, original)
        srv.stop()
        srv = await f3_killed_after_commit(db, shop)
        async with httpx.AsyncClient(base_url=srv.base, timeout=60.0) as client:
            await f6_payments(client, db, shop)
            await f7_reconcile(client, db, shop)
    finally:
        srv.stop()
        try:
            os.unlink(HOLD_FLAG)
        except OSError:
            pass

    print("\n" + "=" * 72)
    print(f"  passes={len(passes)}  failures={len(failures)}")
    for f in failures:
        print(f"    RED: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--serve-hold":
        serve_hold(int(sys.argv[2]))
        sys.exit(0)
    rc = asyncio.run(main())
    print(f"PROVE_MONEY_FAULTS_EXIT={rc}")
    sys.exit(rc)
