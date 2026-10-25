"""Prove the role screen's routes over real HTTP (B6, 2026-10-13): permissions as ticks.

    uv run python scripts/prove_roles.py     (self-restores a scratch from a live dump)

FIXTURE, per run, by SQL as the declared system actor on a scratch copy of dev: an OWNER, an ADMIN
and a STAFF user in Shop A (the born-with roles 0019 seeded). Every role change is made through
the REAL routes and read back from Postgres as a superuser, value against value.

  R1  GET /roles as admin -> every role's permission set EQUALS role_permissions in Postgres, and the
      catalogue is the 22 codes (16 until migration 0029 minted the six sales/buyers/stock codes)
  R2  GET /roles as staff -> 403 naming users.manage
  R3  PUT as ADMIN (no roles.manage) -> 403 naming roles.manage; the staff set unchanged
  R4  the owner ADDS money.view_own to staff -> the staff token issued BEFORE the change reads
      GET /reports/summary (200) on its very next request; audit_log carries the INSERT, owner as actor
  R5  the owner REMOVES it -> the SAME token is refused (403 naming money.view_own); Postgres holds the
      set without it; audit_log carries the DELETE, owner as actor. (Red team 2026-10-13: the first R4
      "removed" a permission dev's staff role never held, wrote nothing, and read a 403 that was
      already there; the cell now PRECONDITIONS on a 403 before the add.)
  R6  the owner removes bills.create -> that staff token's next POST /bills is 403 naming
      bills.create (no re-login, no revoke); restored afterwards
  R7  the OWNER role -> 409 owner_role_fixed; its set unchanged
  R8  roles.manage on another role -> 422 roles_manage_owner_only; unchanged
  R9  an unknown code -> 422 permission_unknown; unchanged
  R10 Shop B's staff role id from Shop A's owner -> 404 (RLS: another shop's role does not exist)
  R11 users.manage onto staff, or off admin -> 422 users_manage_fixed; both unchanged (red team
      2026-10-13: added, it hands staff the owner's password reset; removed, it races the
      last-active-admin guard)
  R12 GET /roles returns exactly SHOP A's roles: every id's tenant_id is Shop A and the count is Shop A's
      (red team 2026-10-13: R1 alone could not tell one shop's three roles from another's)
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

from app.seeddata import PRODUCT_A_ID, SELLER_A_ID, TENANT_A_ID, TENANT_B_ID  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402
SCRATCH_DB = scratch_name("recycle_roles_scratch")
RUN = uuid.uuid4().hex[:8]
ORIG_ENV = dict(os.environ)
PW = {k: f"pw-{RUN}-{k}" for k in ("own", "adm", "stf")}
USER_IDS: dict[str, uuid.UUID] = {}

failures: list[str] = []
passes: list[str] = []


def check(cond: bool, label: str) -> None:
    (passes if cond else failures).append(label)
    sys.stdout.buffer.write(f"  [{'OK  ' if cond else 'RED '}] {label}\n".encode("utf-8", "backslashreplace"))
    sys.stdout.flush()


def restore(live: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-roles-dump-{RUN}")
    label = f"roles-{RUN}"
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
    async with tenant_connection(TENANT_A_ID, actor_id=SYSTEM_ACTOR_ID, actor_username="system:prove_roles") as conn:
        for key, role in (("own", "owner"), ("adm", "admin"), ("stf", "staff")):
            rid = (await conn.execute(text("SELECT id FROM roles WHERE code = :c"), {"c": role})).scalar_one()
            USER_IDS[key] = uuid.uuid4()
            await conn.execute(
                text("INSERT INTO users (id, tenant_id, username, full_name, role_id, password_hash)"
                     " VALUES (:id, :t, :u, :fn, :r, :ph)"),
                {"id": USER_IDS[key], "t": TENANT_A_ID, "u": f"{key}-{RUN}", "fn": key, "r": rid,
                 "ph": await hash_password(PW[key])})


async def su(sql: str, *args: object) -> list:
    import asyncpg
    u = make_url(ORIG_ENV["APP_DATABASE_URL"])
    c = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database=SCRATCH_DB)
    try:
        return list(await c.fetch(sql, *args))
    finally:
        await c.close()


def role_id(tenant: uuid.UUID, code: str) -> str:
    return str(asyncio.run(su("SELECT id FROM roles WHERE tenant_id = $1 AND code = $2", tenant, code))[0]["id"])


def db_set(rid: str) -> set[str]:
    return {r["permission"] for r in asyncio.run(su("SELECT permission FROM role_permissions WHERE role_id = $1", uuid.UUID(rid)))}


def login(base: str, key: str) -> dict:
    r = httpx.post(f"{base}/auth/login", timeout=15, json={"tenant_id": str(TENANT_A_ID), "username": f"{key}-{RUN}",
                                                            "password": PW[key]})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def detail(r: httpx.Response) -> dict:
    try:
        d = r.json().get("detail")
    except Exception:  # noqa: BLE001
        return {}
    return d if isinstance(d, dict) else {}


def run_cells(base: str) -> None:
    own, adm, stf = login(base, "own"), login(base, "adm"), login(base, "stf")
    staff_rid, owner_rid, admin_rid = role_id(TENANT_A_ID, "staff"), role_id(TENANT_A_ID, "owner"), role_id(TENANT_A_ID, "admin")
    staff_before = db_set(staff_rid)

    r = httpx.get(f"{base}/roles", headers=adm, timeout=15)
    roles = r.json().get("roles", []) if r.status_code == 200 else []
    agree = all(set(x["permissions"]) == db_set(x["id"]) for x in roles)
    cat = {c["code"] for c in r.json().get("catalogue", [])} if r.status_code == 200 else set()
    check(r.status_code == 200 and {"owner", "admin", "staff"} <= {x["code"] for x in roles} and agree and len(cat) == 22,
          f"R1 GET /roles: every set equals Postgres ({agree}); catalogue {len(cat)} codes")
    r = httpx.get(f"{base}/roles", headers=stf, timeout=15)
    check(r.status_code == 403 and detail(r).get("required_permission") == "users.manage",
          f"R2 staff GET /roles -> {r.status_code} naming {detail(r).get('required_permission')!r}")

    put = lambda h, rid, perms: httpx.put(f"{base}/roles/{rid}/permissions", headers=h, timeout=15,  # noqa: E731
                                          json={"permissions": sorted(perms)})
    r = put(adm, staff_rid, staff_before | {"money.view_shop"})
    check(r.status_code == 403 and detail(r).get("required_permission") == "roles.manage" and db_set(staff_rid) == staff_before,
          f"R3 admin PUT -> {r.status_code} naming {detail(r).get('required_permission')!r}; staff set unchanged")

    today = dt.date.today().isoformat()
    summary = lambda: httpx.get(f"{base}/reports/summary", headers=stf, timeout=15,  # noqa: E731
                                params={"from_date": today, "to_date": today, "by": "day"})
    base_set = staff_before - {"money.view_own", "money.view_shop"}
    if base_set != staff_before:  # start from WITHOUT, so both directions are real changes
        put(own, staff_rid, base_set)
    s0 = summary()
    t0 = asyncio.run(su("SELECT now() AS n"))[0]["n"]
    r = put(own, staff_rid, base_set | {"money.view_own"})
    s1 = summary()
    ins = asyncio.run(su(
        "SELECT actor_user_id FROM audit_log WHERE table_name = 'role_permissions' AND action = 'INSERT'"
        " AND created_at >= $1 AND new_data->>'permission' = 'money.view_own'", t0))
    check(s0.status_code == 403 and r.status_code == 200 and db_set(staff_rid) == base_set | {"money.view_own"}
          and s1.status_code == 200 and len(ins) == 1 and ins[0]["actor_user_id"] == USER_IDS["own"],
          f"R4 precondition 403 ({s0.status_code}); owner ADDS money.view_own -> {r.status_code}; the SAME staff token's"
          f" next summary -> {s1.status_code}; audit INSERT rows {len(ins)}, owner as actor")
    t1 = asyncio.run(su("SELECT now() AS n"))[0]["n"]
    r = put(own, staff_rid, base_set)
    s2 = summary()
    dels = asyncio.run(su(
        "SELECT actor_user_id FROM audit_log WHERE table_name = 'role_permissions' AND action = 'DELETE'"
        " AND created_at >= $1 AND old_data->>'permission' = 'money.view_own'", t1))
    check(r.status_code == 200 and db_set(staff_rid) == base_set and s2.status_code == 403
          and detail(s2).get("required_permission") == "money.view_own" and len(dels) == 1 and dels[0]["actor_user_id"] == USER_IDS["own"],
          f"R5 owner REMOVES it -> {r.status_code}; the same token's next summary -> {s2.status_code}; audit DELETE rows {len(dels)}")

    bill = lambda: httpx.post(f"{base}/bills", headers=stf, timeout=15, json={  # noqa: E731
        "id": str(uuid.uuid4()), "seller_id": str(SELLER_A_ID), "vehicle_no": "ROLE",
        "device_created_at": dt.datetime.now(tz=dt.timezone.utc).isoformat(), "idempotency_key": f"roles-{uuid.uuid4()}",
        "items": [{"id": str(uuid.uuid4()), "product_id": str(PRODUCT_A_ID), "line_no": 1, "gross_weight": "2.000",
                   "tare_weight": "0.500", "net_weight": "1.500", "unit_price": "15.00"}]})
    r = put(own, staff_rid, (base_set | {"money.view_own"}) - {"bills.create"})
    b = bill()
    put(own, staff_rid, staff_before)
    check(r.status_code == 200 and b.status_code == 403 and detail(b).get("required_permission") == "bills.create"
          and db_set(staff_rid) == staff_before,
          f"R6 bills.create removed -> the same staff token's POST /bills {b.status_code} naming"
          f" {detail(b).get('required_permission')!r}; restored to the starting set")

    owner_before = db_set(owner_rid)
    r = put(own, owner_rid, owner_before - {"bills.void"})
    check(r.status_code == 409 and detail(r).get("code") == "owner_role_fixed" and db_set(owner_rid) == owner_before,
          f"R7 owner role -> {r.status_code} {detail(r).get('code')!r}; unchanged")
    admin_before = db_set(admin_rid)
    r = put(own, admin_rid, admin_before | {"roles.manage"})
    check(r.status_code == 422 and detail(r).get("code") == "roles_manage_owner_only" and db_set(admin_rid) == admin_before,
          f"R8 roles.manage onto admin -> {r.status_code} {detail(r).get('code')!r}; unchanged")
    r = put(own, staff_rid, staff_before | {"bills.teleport"})
    check(r.status_code == 422 and detail(r).get("code") == "permission_unknown" and db_set(staff_rid) == staff_before,
          f"R9 an unknown code -> {r.status_code} {detail(r).get('code')!r}; unchanged")
    r = put(own, staff_rid, staff_before | {"users.manage"})
    r2 = put(own, admin_rid, admin_before - {"users.manage"})
    check(r.status_code == 422 and detail(r).get("code") == "users_manage_fixed" and r2.status_code == 422
          and detail(r2).get("code") == "users_manage_fixed" and db_set(staff_rid) == staff_before and db_set(admin_rid) == admin_before,
          f"R11 users.manage onto staff -> {r.status_code}, off admin -> {r2.status_code}; both unchanged")
    listed = httpx.get(f"{base}/roles", headers=adm, timeout=15).json()["roles"]
    tenants = {row["tenant_id"] for row in asyncio.run(su(
        "SELECT tenant_id FROM roles WHERE id = ANY($1::uuid[])", [uuid.UUID(x["id"]) for x in listed]))}
    a_count = asyncio.run(su("SELECT count(*) AS n FROM roles WHERE tenant_id = $1", TENANT_A_ID))[0]["n"]
    check(tenants == {TENANT_A_ID} and len(listed) == a_count,
          f"R12 GET /roles: every id is Shop A's ({tenants == {TENANT_A_ID}}), {len(listed)} of Shop A's {a_count}")
    other = role_id(TENANT_B_ID, "staff")
    other_before = db_set(other)
    r = put(own, other, set())
    check(r.status_code == 404 and db_set(other) == other_before,
          f"R10 Shop B's staff role from Shop A's owner -> {r.status_code}; Shop B unchanged")


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
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_roles_", delete=False, encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-u", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port",
                             str(port), "--log-level", "warning"], cwd=SERVER_DIR, stdout=log, stderr=subprocess.STDOUT,
                            env=dict(os.environ))
    try:
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                if httpx.get(f"{base}/health", timeout=2).status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.5)
        else:
            print("REFUSED: the server did not come up")
            return 2
        run_cells(base)
    finally:
        proc.terminate()
        proc.wait(timeout=15)
    print(f"\n{len(passes)} OK, {len(failures)} RED")
    print(f"PROVE_ROLES_EXIT={1 if failures else 0}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
