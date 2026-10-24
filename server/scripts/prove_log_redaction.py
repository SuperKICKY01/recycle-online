"""M0 (ADVISOR-DECIDED 2026-10-24, audit d): A FORCED 500'S LOG CARRIES NO BOUND VALUE.

    uv run python scripts/prove_log_redaction.py          (self-restores a scratch from a live dump)

WHY. Every unhandled database error on a request path reaches the server's log twice: once as the
route's own POISON line (bills.py _log_poison_candidate) and once as Starlette's "Exception in ASGI
application" traceback, whose last line is str() of SQLAlchemy's exception. SQLAlchemy's default
renders the statement's BOUND VALUES into that string ("[parameters: (...)]"), so a 500 on a write
of a seller or a bill printed its phone, ID number, plate or weights into a file nobody treats as
personal data. `hide_parameters=True` on both engines (app/db.py) replaces them with SQLAlchemy's
own marker. The audit measured the risk as UNMEASURED (no 500 was in the sampled logs); this
measures it by forcing one.

THE FORCED 500 IS A REAL ONE, not a mock: two bills with the SAME client-minted id and DIFFERENT
idempotency keys. The second collides on purchase_bills' primary key, the IntegrityError handler
finds no bill under ITS key, and the route answers 500 (the H1 matrix found the same 500 across
tenants; OPEN_ITEMS Code debt). The second bill's vehicle_no carries a NEEDLE -- a value fixed
before the write that can occur in the log only as a bound parameter.

THE CELLS, each negative beside a positive sibling the same reader must find:
  E0  the child server starts; the per-run owner signs in; bill A is created (201).
  L0  CONTROL: a needle sent in a QUERY STRING (ignored by the route) IS found in the log -- the
      access line carries it, so the reader is reading THIS server's log and can see a needle.
  L1  the colliding bill answers 500, and Postgres holds no bill under its key.
  L2  the log carries the route's BILL_POISON_CANDIDATE line naming that bill id (the 500 WAS logged).
  L3  the log carries SQLAlchemy's "[SQL parameters hidden due to hide_parameters=True]" marker --
      there were parameters, and they were hidden (absent marker = nothing was ever there to hide).
  L4  THE GUARD: the vehicle_no needle occurs NOWHERE in the log.
  D1  a NOT NULL violation on a sellers row whose phone is a needle, executed on app.db's own
      engine: its text carries the hidden-parameters marker. Beside it, PRINTED and not asserted,
      whether the needle and Postgres's DETAIL reach str(exc).

WHAT hide_parameters DOES NOT HIDE, and D1 is why it is printed rather than assumed: Postgres's own
DETAIL text. A NOT NULL or CHECK violation's DETAIL is "Failing row contains (...)" -- the whole row,
written by the database, not a parameter. MEASURED 2026-10-24 on this stack (asyncpg 0.30 via
SQLAlchemy 2.0): the DETAIL does NOT reach str(exc) -- with hide_parameters the phone needle was
absent, without it the needle was present only inside "[parameters: ...]". A driver or dialect
upgrade could change that; D1's printed line is where it would show.

THE DISPROOF (run by hand 2026-10-24, recorded in PROJECT_STATUS): app/db.py's two
`hide_parameters=True` removed -> L3, L4 and D1 red, the plate needle printed once inside
"[parameters: ...]"; restored byte-identical (sha c7d1d3890f48cf35).
"""
from __future__ import annotations

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
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402

SCRATCH_DB = scratch_name("recycle_log_redaction_scratch")
RUN = uuid.uuid4().hex[:8]
NEEDLE = f"PLATE{RUN.upper()}Q7"          # only ever a bound value of the failing INSERT
CTL_NEEDLE = f"ctl{RUN}zz"                 # sent in a query string: the access line carries it
PHONE_NEEDLE = f"09{int(RUN, 16) % 10**8:08d}"

failures: list[str] = []
passes: list[str] = []


def check(cond: bool, claim: str) -> None:
    print(f"  [{'OK  ' if cond else 'RED '}] {claim}")
    (passes if cond else failures).append(claim)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-logred-dump-{RUN}")
    label = f"logred-{RUN}"
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


async def provision(tenant: uuid.UUID, owner: uuid.UUID, username: str, password: str) -> None:
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.permissions import seed_system_roles
    from app.security import hash_password

    async with tenant_connection(tenant, actor_id=SYSTEM_ACTOR_ID, actor_username="system:prove_log_redaction") as conn:
        await conn.execute(text("INSERT INTO tenants (id, name) VALUES (:id, :n)"), {"id": tenant, "n": f"LR {RUN}"})
        await conn.execute(text("INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                                " VALUES (:t, 'MAIN', :n, 'B', true)"), {"t": tenant, "n": f"LR {RUN}"})
        roles = await seed_system_roles(conn, tenant)
        await conn.execute(text("INSERT INTO users (id, tenant_id, username, full_name, role_id, password_hash)"
                                " VALUES (:id, :t, :u, :u, :r, :ph)"),
                           {"id": owner, "t": tenant, "u": username, "r": roles["owner"],
                            "ph": await hash_password(password)})


def bill(bill_id: str, product: str, seller: str, vehicle_no: str | None) -> dict:
    return {"id": bill_id, "seller_id": seller, "vehicle_no": vehicle_no,
            "device_created_at": datetime.now(timezone.utc).isoformat(),
            "idempotency_key": f"lr-{uuid.uuid4()}",
            "items": [{"id": str(uuid.uuid4()), "product_id": product, "line_no": 1, "gross_weight": "10.000",
                       "tare_weight": "0.000", "net_weight": "10.000", "unit_price": "10.00"}]}


async def d1_detail(scratch_url: str, tenant: uuid.UUID) -> None:
    """D1: what Postgres's DETAIL puts into str(exc), on app.db's OWN engine (hide_parameters set)."""
    from sqlalchemy import text
    from sqlalchemy.exc import SQLAlchemyError
    from app.db import tenant_connection

    rendered = ""
    try:
        async with tenant_connection(tenant) as conn:
            # code is NOT NULL: the row fails, and its DETAIL names the failing row.
            await conn.execute(text("INSERT INTO sellers (tenant_id, code, name, phone)"
                                    " VALUES (:t, NULL, 'd1', :ph)"), {"t": tenant, "ph": PHONE_NEEDLE})
    except SQLAlchemyError as exc:
        rendered = str(exc)
    check("parameters hidden due to hide_parameters=True" in rendered,
          "D1 the NOT NULL violation's text carries the hidden-parameters marker (it went through app.db's engine)")
    print(f"      D1 MEASURED: the sellers phone needle {'IS' if PHONE_NEEDLE in rendered else 'is NOT'} in str(exc)"
          f" (Postgres DETAIL {'reaches' if 'Failing row contains' in rendered else 'does not reach'} the text)")


async def main() -> int:
    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    live_name = app_live.database
    if SCRATCH_DB == live_name:
        print(f"REFUSED: the scratch name {SCRATCH_DB!r} equals the live database.")
        return 2
    print(f"  restoring scratch {SCRATCH_DB!r} from a live dump of {live_name!r}...")
    try:
        restore_scratch(live_name, SCRATCH_DB)
    except Exception as exc:  # noqa: BLE001
        print(f"REFUSED: could not restore the scratch: {exc}")
        return 2
    os.environ["APP_DATABASE_URL"] = app_live.set(database=SCRATCH_DB).render_as_string(hide_password=False)
    os.environ["DIRECTORY_DATABASE_URL"] = dir_live.set(database=SCRATCH_DB).render_as_string(hide_password=False)

    tenant, owner = uuid.uuid4(), uuid.uuid4()
    username, password = f"owner-lr-{RUN}", f"pw-owner-lr-{RUN}"
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_log_redaction_", delete=False,
                                      encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-u", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                             "--port", str(port), "--log-level", "info"],
                            cwd=SERVER_DIR, env=dict(os.environ), stdout=log, stderr=subprocess.STDOUT)
    try:
        up = False
        deadline = time.time() + 40
        while time.time() < deadline and proc.poll() is None:
            try:
                up = httpx.get(f"{base}/health", timeout=2.0).status_code == 200
            except httpx.HTTPError:
                up = False
            if up:
                break
            time.sleep(0.25)
        check(up, "E0 the child server answers /health")
        if not up:
            return 1
        await provision(tenant, owner, username, password)
        async with httpx.AsyncClient(base_url=base, timeout=60.0) as c:
            r = await c.post("/auth/login", json={"tenant_id": str(tenant), "username": username, "password": password})
            tok = r.json().get("access_token", "") if r.status_code == 200 else ""
            check(bool(tok), "E0 the per-run owner signs in")
            h = {"Authorization": f"Bearer {tok}"}

            async def call(method: str, path: str, body: Any = None) -> dict:
                rr = await c.request(method, path, headers=h, json=body)
                if rr.status_code not in (200, 201):
                    raise RuntimeError(f"fixture: {method} {path} -> {rr.status_code} {rr.text[:300]}")
                return rr.json()

            await call("POST", "/grade-tiers", {"code": "A", "name": "เกรด A"})
            uom = (await call("POST", "/uoms", {"code": "KG", "name": "กก."}))["id"]
            cat = (await call("POST", "/product-categories", {"code": "FE", "name": "เหล็ก"}))["id"]
            product = (await call("POST", "/products", {"code": "FE01", "name": "เหล็ก", "category_id": cat,
                                                         "uom_id": uom}))["id"]
            await call("PUT", f"/products/{product}/prices/A", {"price": "10.00"})
            seller = (await call("POST", "/sellers", {"name": f"ผู้ขาย {RUN}"}))["id"]

            bill_id = str(uuid.uuid4())
            first = bill(bill_id, product, seller, None)
            ra = await c.post(f"/bills?probe={CTL_NEEDLE}", headers=h, json=first)
            check(ra.status_code == 201, f"E0 bill A is created (got {ra.status_code})")
            second = bill(bill_id, product, seller, NEEDLE)
            rb = await c.post("/bills", headers=h, json=second)
        log.flush()
        time.sleep(1.0)  # the traceback is written after the response
        text_log = open(log.name, encoding="utf-8", errors="replace").read()

        check(CTL_NEEDLE in text_log, "L0 CONTROL: the query-string needle IS in the log (this server's log, readable)")
        su = await asyncpg.connect(host=app_live.host, port=app_live.port, user="postgres", password="postgres",
                                   database=SCRATCH_DB)
        try:
            n_b = await su.fetchval("SELECT count(*) FROM purchase_bills WHERE idempotency_key = $1",
                                    second["idempotency_key"])
        finally:
            await su.close()
        check(rb.status_code == 500 and n_b == 0,
              f"L1 the colliding bill answers 500 and Postgres holds no bill under its key (got {rb.status_code}, {n_b})")
        check(f"BILL_POISON_CANDIDATE tenant_id={tenant} bill_id={bill_id}" in text_log,
              "L2 the route's BILL_POISON_CANDIDATE line names that bill (the 500 was logged)")
        check("[SQL parameters hidden due to hide_parameters=True]" in text_log,
              "L3 SQLAlchemy's hidden-parameters marker is in the log (there were parameters to hide)")
        check(NEEDLE not in text_log, f"L4 THE GUARD: the vehicle_no needle occurs nowhere in the log"
                                      f" ({text_log.count(NEEDLE)} occurrence(s))")
        await d1_detail(os.environ["APP_DATABASE_URL"], tenant)
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
        log.close()
        try:
            os.unlink(log.name)
        except OSError:
            pass

    print("\n" + "=" * 72)
    print(f"  passes={len(passes)}  failures={len(failures)}")
    for f in failures:
        print(f"    RED: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = asyncio.run(main())
    print(f"PROVE_LOG_REDACTION_EXIT={rc}")
    sys.exit(rc)
