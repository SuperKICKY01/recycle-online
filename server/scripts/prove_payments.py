"""Prove the money ledger (migration 0020, STRUCTURE.md section 2, unit 3 of its
section 12) over real HTTP, on a SCRATCH.

    uv run python scripts/prove_payments.py            (self-restores a scratch from a live dump)
    uv run python scripts/prove_payments.py --database <scratch> --skip-restore

Model on prove_permissions.py: restore a SCRATCH from a live dump of the database
named in APP_DATABASE_URL (which must already be at 0020), start a child uvicorn
on it, gate on /openapi.json before any cell, then drive the real routes with
Shop A's seeded admin and staff. Per-run uuids and idempotency keys everywhere,
so the script is green TWICE in a row with no reseed (proof-must-run-twice): run
2 restores a fresh scratch and mints fresh keys. THE SWITCH IS FLIPPED BY SQL on
the scratch (no route writes branches.separate_cashier in this unit) and flipped
back in `finally`, on a database that is discarded anyway.

THE CELLS, and the disproof each stands against:

  E0  the child serves THIS code and THIS schema: /openapi.json declares POST
      and GET /payments and the `unpaid` query on GET /bills; the scratch reads
      alembic 0020.
  B   THE BACKFILL, read from Postgres: every live positive bill of Shop A has
      allocations summing to its total (with the count of such bills as the
      presence control); the marked reconstructions exist and each carries
      exactly one allocation equal to its amount and its bill's total; a
      reconstruction lacks a payer EXACTLY where its bill lacks created_by
      (value against value); one such bill read over HTTP says paid.
  D   THE DEGENERATE PATH: a bill created with the switch off has exactly one
      cash payment and one allocation equal to its total, read from Postgres,
      the payment naming the submitting session and the bill's own arrival
      instant, and the response derives paid_amount == total, status paid.
      SECTION 12's OWN DISPROOF is the allocation-sum cell: a bill in a
      switch-off tenant whose allocations do not sum to its total. Measured
      red first by deleting the _record_automatic_payment call in bills.py
      (the record carries the reading).
  Q   THE QUEUED BILL: the seven-field body a pre-0018 outbox holds (no
      branch_id, nothing about payments) drains PAID -- the pair is written
      from the server's own values, nothing from the wire.
  R   THE REPLAY: the same body again is 200 with the same id and the ledger
      still holds ONE pair; two concurrent submits of one body land one 201
      and one 200 and one pair.
  Z   A ZERO-TOTAL bill gets no payment (ck_payments_amount forbids it) and
      reads paid (0 = 0).
  S   THE SWITCH, on a scratch: with separate_cashier ON a created bill has
      zero allocations, reads unpaid, and appears in GET /bills?unpaid=true;
      flipping it OFF leaves that bill unpaid and still queued (a switch is a
      display rule); POST /payments allocating the full amount makes it paid
      and drops it from the queue; a second bill paid in two halves reads
      partial then paid; an allocation past the remaining total is refused
      422 allocation_exceeds_bill naming the remaining figure.
  P   THE REFUSALS on POST /payments: an unknown bill is 424 (kind
      dependency_missing, code bill_unknown, the bill id named), a voided bill
      422 bill_voided, a seller mismatch 422 seller_mismatch, allocations past
      the amount 422 allocations_exceed_amount, a duplicated bill 422
      duplicate_allocation; staff (no payments.record) is 403
      permission_required naming it on both routes; an advance (no
      allocations) is 201 with unallocated_amount == amount.
  G   GET /payments lists newest first, this run's rows with their doc_nos,
      and at least one marked reconstruction (presence).
  X   reconcile.py on the scratch, AFTER every write above, exits 0 and its
      report carries P1..P4 (presence control: the four ids in the output).
"""
from __future__ import annotations

import argparse
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
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    SELLER_A_ID,
    STAFF_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_A_STAFF_PASSWORD,
)

try:  # pragma: no cover
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH_DB = "recycle_payments_scratch"
RUN = uuid.uuid4().hex[:8]
SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000"

BASE = ""
failures: list[str] = []
passes: list[str] = []
skips: list[str] = []


def check(cond: bool, claim: str) -> None:
    print(f"  [{'OK  ' if cond else 'RED '}] {claim}")
    (passes if cond else failures).append(claim)


def skip(claim: str, why: str) -> None:
    print(f"  [SKIP] {claim}\n         {why}")
    skips.append(claim)


def header(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _tail(path: str, n: int = 40) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[-n:])
    except OSError:
        return "(no child log)"


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-pay-dump-{RUN}")
    label = f"pay-{RUN}"
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


def wait_for_health(proc: subprocess.Popen, timeout: float = 40.0) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return f"the uvicorn child exited with code {proc.returncode}"
        try:
            r = httpx.get(f"{BASE}/health", timeout=2.0)
            if r.status_code == 200:
                return ""
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    return "health never came up within the timeout"


def assert_serving_this_code() -> str:
    try:
        r = httpx.get(f"{BASE}/openapi.json", timeout=5.0)
    except httpx.HTTPError as exc:
        return f"/openapi.json unreachable: {exc}"
    if r.status_code != 200:
        return f"/openapi.json returned {r.status_code}"
    doc = r.json()
    paths = doc.get("paths", {})
    if "post" not in paths.get("/payments", {}) or "get" not in paths.get("/payments", {}):
        return "the server does not declare POST and GET /payments -- predates 0020"
    params = [p.get("name") for p in paths.get("/bills", {}).get("get", {}).get("parameters", [])]
    if "unpaid" not in params:
        return "GET /bills declares no `unpaid` query -- predates 0020"
    return ""


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def login(client: httpx.AsyncClient, username: str, password: str) -> str | None:
    r = await client.post("/auth/login", json={
        "tenant_id": str(TENANT_A_ID), "username": username, "password": password})
    return r.json().get("access_token") if r.status_code == 200 else None


def detail_of(r: httpx.Response) -> dict:
    try:
        d = r.json().get("detail")
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


def now_iso() -> str:
    return dt.datetime.now(tz=dt.timezone.utc).isoformat()


def item(net: str, unit: str = "10.00") -> dict:
    return {
        "id": str(uuid.uuid4()), "product_id": str(PRODUCT_A_ID), "line_no": 1,
        "gross_weight": net, "tare_weight": "0.000", "net_weight": net, "unit_price": unit,
    }


def bill_body(tag: str, net: str = "1.000", unit: str = "10.00", *, seven_fields: bool = False,
              seller_id: str | None = None) -> dict:
    """A bill. `seven_fields` is the shape a pre-0018 outbox holds VERBATIM
    (mobile/src/sync/types.ts:30-38 at that commit): id, seller_id, vehicle_no,
    device_created_at, idempotency_key, items, total_amount -- no branch_id."""
    body = {
        "id": str(uuid.uuid4()),
        "seller_id": seller_id or str(SELLER_A_ID),
        "vehicle_no": f"70-{RUN[:4]}",
        "device_created_at": now_iso(),
        "idempotency_key": f"pay-{RUN}-{tag}",
        "items": [item(net, unit)],
    }
    if seven_fields:
        body["total_amount"] = str((Decimal(net) * Decimal(unit)).quantize(Decimal("0.01")))
    return body


def payment_body(tag: str, amount: str, allocations: list[dict] | None = None,
                 seller_id: str | None = None, method: str = "cash") -> dict:
    return {
        "id": str(uuid.uuid4()),
        "seller_id": seller_id or str(SELLER_A_ID),
        "method": method,
        "amount": amount,
        "idempotency_key": f"payment-{RUN}-{tag}",
        "device_created_at": now_iso(),
        "allocations": allocations or [],
    }


# ---------------------------------------------------------------------------
# Postgres helpers (the SUPERUSER seat, on the scratch only; RLS is bypassed, so
# every read names the tenant)
# ---------------------------------------------------------------------------
class Db:
    def __init__(self, dsn: str) -> None:
        self.dsn = dsn

    async def ledger(self, bill_id: str) -> dict:
        conn = await asyncpg.connect(self.dsn)
        try:
            pays = await conn.fetch(
                "SELECT p.* FROM payments p JOIN payment_allocations a ON a.payment_id = p.id"
                " WHERE a.bill_id = $1 AND p.tenant_id = $2 ORDER BY p.server_received_at",
                uuid.UUID(bill_id), TENANT_A_ID)
            allocs = await conn.fetch(
                "SELECT * FROM payment_allocations WHERE bill_id = $1 AND tenant_id = $2",
                uuid.UUID(bill_id), TENANT_A_ID)
            head = await conn.fetchrow(
                "SELECT server_received_at, total_amount FROM purchase_bills WHERE id = $1",
                uuid.UUID(bill_id))
        finally:
            await conn.close()
        return {"payments": [dict(p) for p in pays], "allocations": [dict(a) for a in allocs],
                "bill": dict(head) if head else None}

    async def fetchval(self, sql: str, *args):
        conn = await asyncpg.connect(self.dsn)
        try:
            return await conn.fetchval(sql, *args)
        finally:
            await conn.close()

    async def fetchrow(self, sql: str, *args):
        conn = await asyncpg.connect(self.dsn)
        try:
            return await conn.fetchrow(sql, *args)
        finally:
            await conn.close()

    async def set_switch(self, on: bool) -> None:
        """Flip Shop A's born-with branch. branches is AUDITED, so the actor and
        the tenant context are declared on this session first (the audit row
        carries tenant_id = app.tenant_id into a FORCE-RLS table)."""
        conn = await asyncpg.connect(self.dsn)
        try:
            await conn.execute("SELECT set_config('app.actor_id', $1, false)", SYSTEM_ACTOR)
            await conn.execute("SELECT set_config('app.actor_username', $1, false)",
                               "system:prove_payments")
            await conn.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))
            n = await conn.execute(
                "UPDATE branches SET separate_cashier = $1 WHERE tenant_id = $2", on, TENANT_A_ID)
            if n != "UPDATE 1":
                raise RuntimeError(f"expected to flip ONE branch of Shop A, got {n}")
        finally:
            await conn.close()


def alloc_sum(led: dict) -> str:
    return str(sum((a["amount"] for a in led["allocations"]), Decimal("0.00")).quantize(Decimal("0.01")))


# ---------------------------------------------------------------------------
# the cells
# ---------------------------------------------------------------------------
async def run(client: httpx.AsyncClient, db: Db, scratch: str) -> None:
    admin = await login(client, ADMIN_USERNAME, TENANT_A_PASSWORD)
    staff = await login(client, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
    check(bool(admin) and bool(staff), "E0: Shop A's seeded admin and staff sign in")
    if not admin or not staff:
        return
    admin_id = (await client.get("/whoami", headers=auth(admin))).json().get("user_id")

    # ---------------------------------------------------------------- B
    header("B  the backfill, read from Postgres (0020's reconstructions)")
    live_positive = await db.fetchval(
        "SELECT count(*) FROM purchase_bills WHERE tenant_id = $1 AND voided_at IS NULL"
        " AND total_amount > 0", TENANT_A_ID)
    unbalanced = await db.fetchval(
        "SELECT count(*) FROM (SELECT b.id FROM purchase_bills b"
        " LEFT JOIN payment_allocations a ON a.bill_id = b.id"
        " LEFT JOIN payments p ON p.id = a.payment_id AND p.voided_at IS NULL"
        " WHERE b.tenant_id = $1 AND b.voided_at IS NULL AND b.total_amount > 0"
        " GROUP BY b.id, b.total_amount"
        " HAVING coalesce(sum(CASE WHEN p.id IS NULL THEN 0 ELSE a.amount END), 0)"
        "        <> b.total_amount) x", TENANT_A_ID)
    check(live_positive > 0 and unbalanced == 0,
          f"B1: every one of Shop A's {live_positive} live positive bills has live allocations"
          f" summing to its total ({unbalanced} do not)")
    marked = await db.fetchval(
        "SELECT count(*) FROM payments WHERE tenant_id = $1 AND recorded_by_migration", TENANT_A_ID)
    marked_bad = await db.fetchval(
        "SELECT count(*) FROM payments p WHERE p.tenant_id = $1 AND p.recorded_by_migration"
        " AND NOT EXISTS (SELECT 1 FROM payment_allocations a JOIN purchase_bills b"
        "   ON b.id = a.bill_id WHERE a.payment_id = p.id AND a.amount = p.amount"
        "   AND b.total_amount = p.amount"
        "   AND p.idempotency_key = 'auto:' || b.id::text"
        "   AND (SELECT count(*) FROM payment_allocations a2 WHERE a2.payment_id = p.id) = 1)",
        TENANT_A_ID)
    check(marked > 0 and marked_bad == 0,
          f"B2: {marked} marked reconstructions, each with exactly ONE allocation equal to"
          f" its amount and to its bill's total, keyed auto:<bill id> ({marked_bad} are not)")
    payer_mismatch = await db.fetchval(
        "SELECT count(*) FROM payments p JOIN purchase_bills b"
        "   ON p.idempotency_key = 'auto:' || b.id::text AND b.tenant_id = p.tenant_id"
        " WHERE p.tenant_id = $1 AND p.recorded_by_migration"
        "   AND (p.paid_by IS NULL) <> (b.created_by IS NULL)"
        "   AND NOT (p.paid_by IS NOT DISTINCT FROM b.created_by)", TENANT_A_ID)
    payerless = await db.fetchval(
        "SELECT count(*) FROM payments WHERE tenant_id = $1 AND recorded_by_migration"
        " AND paid_by IS NULL", TENANT_A_ID)
    check(payer_mismatch == 0,
          f"B3: a reconstruction lacks a payer EXACTLY where its bill lacks created_by"
          f" ({payerless} payer-less of {marked}; {payer_mismatch} disagree, value against value)")
    sample = await db.fetchrow(
        "SELECT b.id, b.total_amount FROM purchase_bills b JOIN payments p"
        "   ON p.idempotency_key = 'auto:' || b.id::text AND p.tenant_id = b.tenant_id"
        " WHERE b.tenant_id = $1 AND p.recorded_by_migration AND b.voided_at IS NULL"
        " ORDER BY b.server_received_at DESC LIMIT 1", TENANT_A_ID)
    if sample is None:
        skip("B4: a pre-existing bill reads paid over HTTP", "no marked pair on this copy")
    else:
        r = await client.get(f"/bills/{sample['id']}", headers=auth(admin))
        b = r.json() if r.status_code == 200 else {}
        check(r.status_code == 200 and b.get("payment_status") == "paid"
              and b.get("paid_amount") == str(sample["total_amount"]),
              f"B4: a pre-existing bill ({sample['id']}) reads payment_status=paid,"
              f" paid_amount == total ({b.get('paid_amount')} / {sample['total_amount']})")

    # ---------------------------------------------------------------- D
    header("D  the degenerate path: the bill's transaction writes the pair")
    body_d = bill_body("d", "0.100", "10.00")
    r = await client.post("/bills", headers=auth(admin), json=body_d)
    bd = r.json() if r.status_code == 201 else {}
    check(r.status_code == 201, f"D0: POST /bills -> 201 (got {r.status_code})")
    led = await db.ledger(body_d["id"])
    pays, allocs = led["payments"], led["allocations"]
    print(f"      ledger: payments={len(pays)} allocations={len(allocs)} sum={alloc_sum(led)}"
          f" total={bd.get('total_amount')}")
    check(len(pays) == 1 and len(allocs) == 1,
          f"D1: exactly one payment and one allocation in Postgres (got {len(pays)}/{len(allocs)})")
    check(alloc_sum(led) == bd.get("total_amount"),
          f"D2 (SECTION 12's DISPROOF): the allocations sum to the bill's total"
          f" (sum={alloc_sum(led)}, total={bd.get('total_amount')})")
    p0 = pays[0] if pays else {}
    check(str(p0.get("amount")) == bd.get("total_amount") and p0.get("method") == "cash"
          and p0.get("recorded_by_migration") is False,
          f"D3: one CASH payment for the whole total, a record not a reconstruction"
          f" (amount={p0.get('amount')} method={p0.get('method')})")
    check(str(p0.get("paid_by")) == admin_id,
          f"D4: paid_by is the submitting session (paid_by={p0.get('paid_by')} whoami={admin_id})")
    check(p0.get("server_received_at") == (led["bill"] or {}).get("server_received_at"),
          "D5: the payment carries the bill's own arrival instant")
    check(p0.get("idempotency_key") == f"auto:{body_d['id']}",
          f"D6: the automatic key is auto:<bill id> (got {p0.get('idempotency_key')})")
    check(bd.get("paid_amount") == bd.get("total_amount") and bd.get("payment_status") == "paid",
          f"D7: the 201 derives paid_amount == total and payment_status paid"
          f" (paid_amount={bd.get('paid_amount')} status={bd.get('payment_status')})")
    r = await client.get(f"/bills/{body_d['id']}", headers=auth(admin))
    check(r.status_code == 200 and r.json().get("payment_status") == "paid"
          and r.json().get("paid_amount") == bd.get("total_amount"),
          "D8: GET /bills/{id} derives the same")
    r = await client.get("/bills?unpaid=true", headers=auth(admin))
    check(r.status_code == 200
          and body_d["id"] not in [x["id"] for x in r.json().get("bills", [])],
          "D9: a paid bill is NOT in the unpaid queue")

    # ---------------------------------------------------------------- Q
    header("Q  the queued bill: the seven-field pre-0018 body drains PAID")
    body_q = bill_body("q", "2.000", "10.00", seven_fields=True)
    check(set(body_q) == {"id", "seller_id", "vehicle_no", "device_created_at",
                          "idempotency_key", "items", "total_amount"},
          "Q0: the body is the seven-field shape and nothing else (control)")
    r = await client.post("/bills", headers=auth(admin), json=body_q)
    bq = r.json() if r.status_code == 201 else {}
    ledq = await db.ledger(body_q["id"])
    check(r.status_code == 201 and len(ledq["payments"]) == 1
          and alloc_sum(ledq) == bq.get("total_amount") == "20.00",
          f"Q1: the queued body lands 201 with its pair (payments={len(ledq['payments'])},"
          f" sum={alloc_sum(ledq)}, total={bq.get('total_amount')})")

    # ---------------------------------------------------------------- R
    header("R  the replay writes no second pair; a concurrent same-body pair lands one")
    r = await client.post("/bills", headers=auth(admin), json=body_d)
    ledr = await db.ledger(body_d["id"])
    check(r.status_code == 200 and r.json().get("id") == body_d["id"]
          and len(ledr["payments"]) == 1 and len(ledr["allocations"]) == 1,
          f"R1: the replay is 200 with the same id and the ledger still holds one pair"
          f" (got {r.status_code}, {len(ledr['payments'])}/{len(ledr['allocations'])})")
    body_r = bill_body("race", "3.000", "10.00")
    rr = await asyncio.gather(
        client.post("/bills", headers=auth(admin), json=body_r),
        client.post("/bills", headers=auth(admin), json=body_r),
    )
    codes = sorted(x.status_code for x in rr)
    ledrr = await db.ledger(body_r["id"])
    check(codes == [200, 201] and len(ledrr["payments"]) == 1 and len(ledrr["allocations"]) == 1,
          f"R2: two concurrent submits of one body -> {codes}, one pair"
          f" ({len(ledrr['payments'])}/{len(ledrr['allocations'])})")

    # ---------------------------------------------------------------- Z
    header("Z  a zero-total bill: no payment, reads paid (0 = 0)")
    body_z = bill_body("zero", "1.000", "0.00")
    r = await client.post("/bills", headers=auth(admin), json=body_z)
    bz = r.json() if r.status_code == 201 else {}
    ledz = await db.ledger(body_z["id"])
    check(r.status_code == 201 and bz.get("total_amount") == "0.00"
          and len(ledz["payments"]) == 0 and len(ledz["allocations"]) == 0
          and bz.get("payment_status") == "paid" and bz.get("paid_amount") == "0.00",
          f"Z1: total 0.00, zero payments, zero allocations, status paid"
          f" (got {r.status_code} total={bz.get('total_amount')} status={bz.get('payment_status')})")

    # ---------------------------------------------------------------- S
    header("S  the switch, flipped by SQL on the scratch")
    await db.set_switch(True)
    sw = await db.fetchval("SELECT separate_cashier FROM branches WHERE tenant_id = $1", TENANT_A_ID)
    check(sw is True, "S0: Shop A's branch reads separate_cashier = true (control)")
    body_s = bill_body("switch-on", "5.000", "10.00")
    r = await client.post("/bills", headers=auth(admin), json=body_s)
    bs = r.json() if r.status_code == 201 else {}
    leds = await db.ledger(body_s["id"])
    check(r.status_code == 201 and len(leds["payments"]) == 0 and len(leds["allocations"]) == 0,
          f"S1: with the switch ON a created bill has ZERO payments and allocations"
          f" (got {r.status_code}, {len(leds['payments'])}/{len(leds['allocations'])})")
    check(bs.get("payment_status") == "unpaid" and bs.get("paid_amount") == "0.00",
          f"S2: the 201 derives unpaid / 0.00 (got {bs.get('payment_status')} / {bs.get('paid_amount')})")
    r = await client.get("/bills?unpaid=true", headers=auth(admin))
    queued = {x["id"]: x for x in r.json().get("bills", [])} if r.status_code == 200 else {}
    check(body_s["id"] in queued and queued[body_s["id"]].get("payment_status") == "unpaid",
          "S3: the unpaid bill appears in GET /bills?unpaid=true, derived unpaid")
    check(body_d["id"] not in queued, "S3 (control): the paid bill from D is still not queued")
    body_s2 = bill_body("switch-on-2", "4.000", "10.00")   # 40.00, paid in two halves below
    r = await client.post("/bills", headers=auth(admin), json=body_s2)
    check(r.status_code == 201 and r.json().get("payment_status") == "unpaid",
          "S4: a second bill under the switch is unpaid too")
    await db.set_switch(False)
    sw = await db.fetchval("SELECT separate_cashier FROM branches WHERE tenant_id = $1", TENANT_A_ID)
    check(sw is False, "S5: the switch is back OFF (control)")
    r = await client.get(f"/bills/{body_s['id']}", headers=auth(admin))
    check(r.status_code == 200 and r.json().get("payment_status") == "unpaid",
          "S6: flipping the switch OFF leaves the bill UNPAID -- a switch is a display rule")
    r = await client.get("/bills?unpaid=true", headers=auth(admin))
    check(body_s["id"] in [x["id"] for x in r.json().get("bills", [])],
          "S7: and still in the unpaid queue")
    # a bill created NOW, with the switch back off, gets its pair again
    body_s3 = bill_body("switch-off-again", "1.000", "10.00")
    r = await client.post("/bills", headers=auth(admin), json=body_s3)
    leds3 = await db.ledger(body_s3["id"])
    check(r.status_code == 201 and len(leds3["payments"]) == 1
          and r.json().get("payment_status") == "paid",
          "S8: a bill created after the flip back gets its automatic pair again")
    # pay the first in full
    pay1 = payment_body("s-full", bs["total_amount"],
                        [{"bill_id": body_s["id"], "amount": bs["total_amount"]}])
    r = await client.post("/payments", headers=auth(admin), json=pay1)
    pr = r.json() if r.status_code == 201 else {}
    check(r.status_code == 201 and pr.get("allocated_amount") == bs["total_amount"]
          and pr.get("unallocated_amount") == "0.00" and pr.get("paid_by") == admin_id,
          f"S9: POST /payments allocating the full amount -> 201, allocated == amount,"
          f" paid_by the session (got {r.status_code} {detail_of(r).get('code')!r})")
    r = await client.get(f"/bills/{body_s['id']}", headers=auth(admin))
    check(r.status_code == 200 and r.json().get("payment_status") == "paid"
          and r.json().get("paid_amount") == bs["total_amount"],
          "S10: the bill now reads paid with paid_amount == total")
    r = await client.get("/bills?unpaid=true", headers=auth(admin))
    check(body_s["id"] not in [x["id"] for x in r.json().get("bills", [])],
          "S11: and it left the unpaid queue")
    # the second bill: half, then over, then the rest
    r = await client.post("/payments", headers=auth(admin), json=payment_body(
        "s-half", "20.00", [{"bill_id": body_s2["id"], "amount": "20.00"}]))
    check(r.status_code == 201, f"S12: half of 40.00 -> 201 (got {r.status_code})")
    r = await client.get(f"/bills/{body_s2['id']}", headers=auth(admin))
    check(r.status_code == 200 and r.json().get("payment_status") == "partial"
          and r.json().get("paid_amount") == "20.00",
          f"S13: the bill reads PARTIAL at 20.00 (got {r.json().get('payment_status')}"
          f" / {r.json().get('paid_amount')})")
    r = await client.post("/payments", headers=auth(admin), json=payment_body(
        "s-over", "20.01", [{"bill_id": body_s2["id"], "amount": "20.01"}]))
    d = detail_of(r)
    check(r.status_code == 422 and d.get("code") == "allocation_exceeds_bill"
          and d.get("remaining") == "20.00" and d.get("paid_amount") == "20.00",
          f"S14: 20.01 against 20.00 remaining -> 422 allocation_exceeds_bill naming"
          f" remaining=20.00 (got {r.status_code} {d.get('code')!r} remaining={d.get('remaining')!r})")
    r = await client.post("/payments", headers=auth(admin), json=payment_body(
        "s-rest", "20.00", [{"bill_id": body_s2["id"], "amount": "20.00"}]))
    check(r.status_code == 201, f"S15: the remaining 20.00 -> 201 (got {r.status_code})")
    r = await client.get(f"/bills/{body_s2['id']}", headers=auth(admin))
    check(r.status_code == 200 and r.json().get("payment_status") == "paid"
          and r.json().get("paid_amount") == "40.00",
          "S16: the bill reads paid at 40.00")

    # ---------------------------------------------------------------- P
    header("P  the refusals on POST /payments, and the permission")
    ghost = str(uuid.uuid4())
    r = await client.post("/payments", headers=auth(admin), json=payment_body(
        "p-unknown", "1.00", [{"bill_id": ghost, "amount": "1.00"}]))
    d = detail_of(r)
    check(r.status_code == 424 and d.get("kind") == "dependency_missing"
          and d.get("code") == "bill_unknown" and d.get("bill_id") == ghost,
          f"P1: an unknown bill -> 424 dependency_missing bill_unknown naming it"
          f" (got {r.status_code} {d.get('kind')!r} {d.get('code')!r})")
    # a bill to void, then allocate against
    body_v = bill_body("to-void", "1.000", "10.00")
    r = await client.post("/bills", headers=auth(admin), json=body_v)
    rv = await client.post(f"/bills/{body_v['id']}/void", headers=auth(admin),
                           json={"reason": f"prove_payments {RUN}"})
    check(r.status_code == 201 and rv.status_code == 200, "P2 (staging): a bill is created and voided")
    r = await client.post("/payments", headers=auth(admin), json=payment_body(
        "p-voided", "1.00", [{"bill_id": body_v["id"], "amount": "1.00"}]))
    d = detail_of(r)
    check(r.status_code == 422 and d.get("code") == "bill_voided",
          f"P2: a voided bill -> 422 bill_voided (got {r.status_code} {d.get('code')!r})")
    # a second seller of Shop A, for the mismatch
    rs = await client.post("/sellers", headers=auth(admin), json={"name": f"seller {RUN}"})
    other_seller = rs.json().get("id") if rs.status_code == 201 else None
    if other_seller is None:
        skip("P3: a seller mismatch -> 422 seller_mismatch",
             f"POST /sellers returned {rs.status_code}; no second seller to mismatch with")
    else:
        r = await client.post("/payments", headers=auth(admin), json=payment_body(
            "p-mismatch", "1.00", [{"bill_id": body_d["id"], "amount": "1.00"}],
            seller_id=other_seller))
        d = detail_of(r)
        check(r.status_code == 422 and d.get("code") == "seller_mismatch"
              and d.get("bill_seller_id") == str(SELLER_A_ID),
              f"P3: the bill's seller is not the payment's -> 422 seller_mismatch naming the"
              f" bill's seller (got {r.status_code} {d.get('code')!r})")
    r = await client.post("/payments", headers=auth(admin), json=payment_body(
        "p-over-amount", "1.00", [{"bill_id": body_d["id"], "amount": "1.01"}]))
    d = detail_of(r)
    check(r.status_code == 422 and d.get("code") == "allocations_exceed_amount",
          f"P4: allocations past the payment's amount -> 422 allocations_exceed_amount"
          f" (got {r.status_code} {d.get('code')!r})")
    r = await client.post("/payments", headers=auth(admin), json=payment_body(
        "p-dup", "2.00", [{"bill_id": body_d["id"], "amount": "1.00"},
                          {"bill_id": body_d["id"], "amount": "1.00"}]))
    d = detail_of(r)
    check(r.status_code == 422 and d.get("code") == "duplicate_allocation",
          f"P5: the same bill twice in one payment -> 422 duplicate_allocation"
          f" (got {r.status_code} {d.get('code')!r})")
    for method, path, body in (("GET", "/payments", None),
                               ("POST", "/payments", payment_body("p-staff", "1.00"))):
        r = await client.request(method, path, headers=auth(staff), json=body)
        d = detail_of(r)
        check(r.status_code == 403 and d.get("code") == "permission_required"
              and d.get("required_permission") == "payments.record",
              f"P6: staff {method} {path} -> 403 permission_required naming payments.record"
              f" (got {r.status_code} {d.get('code')!r} {d.get('required_permission')!r})")
    adv = payment_body("p-advance", "7.50")
    r = await client.post("/payments", headers=auth(admin), json=adv)
    pa = r.json() if r.status_code == 201 else {}
    check(r.status_code == 201 and pa.get("allocations") == [] and pa.get("unallocated_amount") == "7.50"
          and pa.get("allocated_amount") == "0.00",
          f"P7: an advance (no allocations) -> 201 with unallocated_amount == amount"
          f" (got {r.status_code} unallocated={pa.get('unallocated_amount')!r})")
    r = await client.post("/payments", headers=auth(admin), json=adv)
    check(r.status_code == 200 and r.json().get("id") == adv["id"],
          f"P8: the replay of a payment is 200 with the same id (got {r.status_code})")
    n_adv = await db.fetchval("SELECT count(*) FROM payments WHERE idempotency_key = $1",
                              adv["idempotency_key"])
    check(n_adv == 1, f"P9: one payment row for the replayed key (got {n_adv})")
    race = payment_body("p-race", "1.25")
    rr = await asyncio.gather(
        client.post("/payments", headers=auth(admin), json=race),
        client.post("/payments", headers=auth(admin), json=race),
    )
    codes = sorted(x.status_code for x in rr)
    n_race = await db.fetchval("SELECT count(*) FROM payments WHERE idempotency_key = $1",
                               race["idempotency_key"])
    check(codes == [200, 201] and n_race == 1,
          f"P10: two concurrent submits of one payment -> {codes}, one row ({n_race})")

    # ---------------------------------------------------------------- G
    header("G  GET /payments: newest first, this run's rows, a reconstruction present")
    r = await client.get("/payments?limit=200", headers=auth(admin))
    rows = r.json().get("payments", []) if r.status_code == 200 else []
    ids = [x["id"] for x in rows]
    stamps = [x["server_received_at"] for x in rows]
    check(r.status_code == 200 and stamps == sorted(stamps, reverse=True),
          f"G1: 200, {len(rows)} rows, newest first")
    check(pay1["id"] in ids and adv["id"] in ids,
          "G2: this run's full payment and its advance are listed")
    mine = next((x for x in rows if x["id"] == pay1["id"]), {})
    check(mine.get("allocations", [{}])[0].get("doc_no") == bs.get("doc_no")
          and mine.get("allocations", [{}])[0].get("amount") == bs.get("total_amount"),
          f"G3: the full payment's allocation names the bill's doc_no and amount"
          f" (got {mine.get('allocations')})")
    check(any(x.get("recorded_by_migration") for x in rows),
          "G4: at least one marked reconstruction is listed (presence)")
    check(all(x.get("status") in ("active", "voided") for x in rows) and len(rows) > 0,
          "G5: every row carries a status (control)")

    # ---------------------------------------------------------------- X
    header("X  reconcile.py on the scratch after every write above")
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    # --verbose, so every per-tenant check line is printed: a clean tenant
    # otherwise collapses to "N checks, all clean" and the P1..P4 presence
    # control below reads an empty haystack (measured on the first run).
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "reconcile.py"), "--database", scratch,
         "--verbose"],
        cwd=SERVER_DIR, env=env, capture_output=True, text=True, timeout=600,
        encoding="utf-8", errors="replace")
    out = cp.stdout + cp.stderr
    present = [pid for pid in ("P1", "P2", "P3", "P4")
               if any(ln.strip().startswith(f"[OK  ] {pid} ") for ln in out.splitlines())]
    check(cp.returncode == 0, f"X1: reconcile.py exits 0 on the scratch (exit {cp.returncode})")
    check(present == ["P1", "P2", "P3", "P4"],
          f"X2: the report carries P1..P4 as [OK] lines (present: {present})")
    if cp.returncode != 0:
        print(out[-3000:])


async def main() -> int:
    global BASE
    ap = argparse.ArgumentParser(description="Prove the money ledger (0020) on a scratch.")
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
    db = Db(f"postgresql://postgres:postgres@{app_live.host}:{app_live.port}/{scratch}")
    version = await db.fetchval("SELECT version_num FROM alembic_version")
    check(version == "0020", f"E0: the scratch is at alembic 0020 (got {version})")
    if version != "0020":
        return 1

    port = free_port()
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(
        mode="w", suffix=".log", prefix="prove_payments_", delete=False, encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=SERVER_DIR, env=dict(os.environ), stdout=log, stderr=subprocess.STDOUT)
    print(f"  child uvicorn pid={proc.pid} on {BASE} against scratch {scratch!r} (log {log.name})")

    try:
        why = wait_for_health(proc)
        if why:
            print(_tail(log.name))
            check(False, f"E0: server started -- {why}")
            return 1
        wrong = assert_serving_this_code()
        if wrong:
            check(False, f"E0: serving THIS code -- {wrong}")
            return 1
        check(True, "E0: /openapi.json declares POST and GET /payments and GET /bills?unpaid")
        async with httpx.AsyncClient(base_url=BASE, timeout=20.0) as client:
            try:
                await run(client, db, scratch)
            finally:
                # The switch back OFF whatever happened above: a scratch is
                # discarded, but a half-flipped copy would mislead the next
                # reader of it.
                try:
                    await db.set_switch(False)
                except Exception as exc:  # noqa: BLE001
                    print(f"  (could not flip the switch back: {exc})")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()

    header("RESULT")
    print(f"  passes: {len(passes)}  failures: {len(failures)}  skips: {len(skips)}")
    for f in failures:
        print(f"    - {f}")
    for s in skips:
        print(f"    (skipped) {s}")
    return 1 if failures else 0


if __name__ == "__main__":
    code = asyncio.run(main())
    print(f"PROVE_PAYMENTS_EXIT={code}")
    sys.exit(code)
