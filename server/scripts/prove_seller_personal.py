"""Prove the seller personal-data gate (migration 0024, sellers.read_personal) over real
HTTP, on a SCRATCH, and the migration's round trip on the same scratch.

    uv run python scripts/prove_seller_personal.py     (self-restores a scratch from a live dump)

ADVISOR-DECIDED 2026-10-12 (seller search, C1): a seller's FULL id_number and address are
personal data, returned ONLY to a caller holding sellers.read_personal (granted by 0024 to
every role holding users.manage -- owner and admin at birth). Every other caller receives
neither KEY. Measured before 0024 on lane A's walk database: staff received both from
GET /sellers.

THE INSTRUMENT IS THE RAW BODY. Every "absent" cell asserts the full value's BYTES are not in
`response.content` -- not that a parsed key is missing, which a nested echo or an error
string would slip past (buddhist-method: what the route RETURNS, not what the source says it
returns). Each such cell has its positive control in the same run: the SAME byte search over
an admin response that carries the value.

THE FIXTURE, per run (so the proof is green twice with no reseed): in Shop A, by SQL as the
declared system actor, three users -- `padm-<run>` on the admin system role, `pstf-<run>` on
the staff system role, and `pwri-<run>` on a role minted here holding sellers.write,
sellers.create and bills.read but NOT sellers.read_personal (the only principal that can EDIT
a seller without being allowed to see the ID; no system role is that shape). One seller per
run created by admin with a distinctive 13-digit ID and an ASCII address.

THE CELLS
  E0  the child serves THIS code (/openapi.json declares PATCH /sellers/{seller_id}) and the
      scratch is at 0024; /whoami: admin holds sellers.read_personal, staff and writer do not.
  L   GET /sellers: admin's raw body CONTAINS the ID and the address (the control); staff's
      raw body contains neither, and the fixture row carries neither key.
  C   POST /sellers by STAFF with an ID and address: 201, the echo's raw body carries
      neither; admin's list then shows the stored ID (the create wrote it, it only did not
      echo it).
      C3: the same by staff with a SUPPLIED code (the third create return).
  R   the create REPLAY (a reservation spent twice) by staff: 200 on the second, raw body
      carries neither.
  H   GET /sellers/{id}/history by staff: the raw body carries neither.
  X   refusal bodies by staff, each carrying the ID in the REQUEST: a 409 duplicate_code, a
      422 validation refusal (an over-long id_number), a 403 on PATCH -- none hands it back.
  D   the seller "detail" echoes (there is no GET /sellers/{id}): the writer's
      deactivate and activate echoes carry neither.
  W   THE NO-ERASE CELLS: the writer's PATCH that OMITS the personal fields -> 200, and the
      stored id_number and address read back out of Postgres EQUAL the values fixed before
      the write; the writer's PATCH with id_number null, and with a new address, -> 403
      permission_required naming sellers.read_personal, and the stored values are unchanged.
      Control: admin's PATCH of the address -> 200 and its echo carries it.
  P   THE DISCRIMINATING PAIR: a role holding every catalogue code but sellers.read_personal
      (users.manage included) neither reads nor writes the fields; a role holding only
      sellers.read_personal and sellers.write does both. Without it a gate keyed on ANY code the
      admin holds and staff lacks would pass every cell above (red team, 2026-10-12).
  RT  after the child stops: downgrade to 0023 (catalogue 15, no grant), upgrade to 0024
      (catalogue 16, grants EQUAL the users.manage holders as a set); then a grant to the
      staff role and a downgrade -> REFUSED naming the count, head still 0024; the grant is
      removed (scratch only) and the scratch is left at 0024.
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

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.seeddata import TENANT_A_ID  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402  (scratch names are decided in lane.py only)
SCRATCH_DB = scratch_name("recycle_seller_personal_scratch")
RUN = uuid.uuid4().hex[:8]
ORIG_ENV = dict(os.environ)
HEAD = "0024"
PERM = "sellers.read_personal"

BASE = ""
failures: list[str] = []


def check(cond: bool, label: str) -> bool:
    if not cond:
        failures.append(label)
    print(f"  [{'ok ' if cond else 'RED'}] {label}")
    return cond


def header(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


# Distinctive per-run values, fixed BEFORE any write, so "absent from the body" is a
# statement about the echo and never about luck. Obviously fake: the 13-digit IDs start 8
# then 0 and carry the run's digits; no checksum (the server validates none).
_DIGITS = f"{int(RUN, 16) % 10**11:011d}"
ID_MAIN = "80" + _DIGITS          # the admin-created fixture seller
ID_STAFF = "81" + _DIGITS         # the staff-created seller (C)
ID_REPLAY = "82" + _DIGITS        # the reservation create (R)
ID_REFUSED = "83" + _DIGITS       # sent only in refused requests (X)
ADDR_MAIN = f"77/7 personal-probe main {RUN}"
ADDR_STAFF = f"77/8 personal-probe staff {RUN}"
ADDR_REPLAY = f"77/9 personal-probe replay {RUN}"
ADDR_REFUSED = f"77/0 personal-probe refused {RUN}"
ADDR_ADMIN_EDIT = f"78/1 personal-probe admin-edit {RUN}"
ADDR_WRITER_TRY = f"78/2 personal-probe writer-try {RUN}"
ID_SUPPLIED = "84" + _DIGITS      # the staff create with a SUPPLIED code (C3)
ADDR_SUPPLIED = f"78/3 personal-probe supplied {RUN}"
ADDR_ONLY = f"78/4 personal-probe only-holder {RUN}"
PW = {k: f"pw-{RUN}-{k}" for k in ("padm", "pstf", "pwri", "pnot", "pone")}


def has(r: httpx.Response, value: str) -> bool:
    return value.encode("utf-8") in r.content


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-personal-dump-{RUN}")
    label = f"personal-{RUN}"
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "backup_db.py"),
         "--db", live_name, "--out", out, "--label", label],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300,
        encoding="utf-8", errors="replace", env=ORIG_ENV)
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py (live) failed: {(cp.stdout + cp.stderr)[-600:]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    if len(dumps) != 1:
        raise RuntimeError(f"expected one dump dir ending {label!r}, got {dumps}")
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "restore_db.py"),
         os.path.join(out, dumps[0]), "--into", scratch],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300,
        encoding="utf-8", errors="replace", env=ORIG_ENV)
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py -> {scratch} failed: {(cp.stdout + cp.stderr)[-600:]}")
    shutil.rmtree(out, ignore_errors=True)


def run_alembic(scratch: str, *args: str) -> tuple[int, str]:
    env = dict(ORIG_ENV)
    env["MIGRATION_DATABASE_URL"] = (
        make_url(ORIG_ENV["MIGRATION_DATABASE_URL"]).set(database=scratch)
        .render_as_string(hide_password=False))
    env["PYTHONIOENCODING"] = "utf-8"
    cp = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=SERVER_DIR, env=env,
                        capture_output=True, text=True, timeout=600,
                        encoding="utf-8", errors="replace")
    return cp.returncode, cp.stdout + cp.stderr


def wait_for_health(proc: subprocess.Popen, timeout: float = 40.0) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return f"the uvicorn child exited with code {proc.returncode}"
        try:
            if httpx.get(f"{BASE}/health", timeout=2.0).status_code == 200:
                return ""
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    return "health never came up within the timeout"


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def detail_of(r: httpx.Response) -> dict:
    try:
        d = r.json().get("detail")
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


# ---------------------------------------------------------------------------- db
async def scalar(sql: str, **params):
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(TENANT_A_ID) as conn:
        return (await conn.execute(text(sql), params)).scalar()


async def stored_personal(seller_id: str) -> tuple[str | None, str | None]:
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(TENANT_A_ID) as conn:
        row = (await conn.execute(
            text("SELECT id_number, address FROM sellers WHERE id = :id"),
            {"id": uuid.UUID(seller_id)})).mappings().one()
        return row["id_number"], row["address"]


async def provision() -> None:
    """Three users in Shop A, and the writer role, by SQL as the declared system actor
    (users, roles and role_permissions are audited)."""
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.security import hash_password
    async with tenant_connection(
        TENANT_A_ID, actor_id=SYSTEM_ACTOR_ID, actor_username="system:prove_seller_personal",
    ) as conn:
        admin_rid = (await conn.execute(text("SELECT id FROM roles WHERE code = 'admin'"))).scalar_one()
        staff_rid = (await conn.execute(text("SELECT id FROM roles WHERE code = 'staff'"))).scalar_one()
        writer_rid = (await conn.execute(
            text("INSERT INTO roles (tenant_id, code, name, is_system, is_active)"
                 " VALUES (:t, :c, :c, false, true) RETURNING id"),
            {"t": TENANT_A_ID, "c": f"pwriter-{RUN}"})).scalar_one()
        for p in ("sellers.write", "sellers.create", "bills.read"):
            await conn.execute(
                text("INSERT INTO role_permissions (tenant_id, role_id, permission)"
                     " VALUES (:t, :r, :p)"), {"t": TENANT_A_ID, "r": writer_rid, "p": p})
        # THE DISCRIMINATING PAIR (nemesis, 2026-10-12): admin/staff/writer cannot tell a gate
        # on sellers.read_personal from a gate on ANY permission admin holds and they lack.
        # `pnot` holds EVERY catalogue code but sellers.read_personal (users.manage included);
        # `pone` holds ONLY sellers.read_personal and sellers.write. A gate keyed on anything
        # else is wrong for at least one of them. The catalogue is read from Postgres, never
        # from app.permissions (a checker must not share the code it checks).
        catalogue = [r[0] for r in (await conn.execute(text("SELECT code FROM permissions"))).all()]
        not_rid = (await conn.execute(
            text("INSERT INTO roles (tenant_id, code, name, is_system, is_active)"
                 " VALUES (:t, :c, :c, false, true) RETURNING id"),
            {"t": TENANT_A_ID, "c": f"pnot-{RUN}"})).scalar_one()
        one_rid = (await conn.execute(
            text("INSERT INTO roles (tenant_id, code, name, is_system, is_active)"
                 " VALUES (:t, :c, :c, false, true) RETURNING id"),
            {"t": TENANT_A_ID, "c": f"pone-{RUN}"})).scalar_one()
        for rid, grants in ((not_rid, [c for c in catalogue if c != PERM]),
                            (one_rid, [PERM, "sellers.write"])):
            for p in grants:
                await conn.execute(
                    text("INSERT INTO role_permissions (tenant_id, role_id, permission)"
                         " VALUES (:t, :r, :p)"), {"t": TENANT_A_ID, "r": rid, "p": p})
        for key, rid in (("padm", admin_rid), ("pstf", staff_rid), ("pwri", writer_rid),
                         ("pnot", not_rid), ("pone", one_rid)):
            await conn.execute(
                text("INSERT INTO users (id, tenant_id, username, full_name, role_id,"
                     " password_hash) VALUES (:id, :t, :u, :fn, :r, :ph)"),
                {"id": uuid.uuid4(), "t": TENANT_A_ID, "u": f"{key}-{RUN}", "fn": key,
                 "r": rid, "ph": await hash_password(PW[key])})


async def login(client: httpx.AsyncClient, key: str) -> str:
    r = await client.post("/auth/login", json={
        "tenant_id": str(TENANT_A_ID), "username": f"{key}-{RUN}", "password": PW[key]})
    r.raise_for_status()
    return r.json()["access_token"]


# ---------------------------------------------------------------------------- cells
async def run_http(client: httpx.AsyncClient) -> None:
    adm = auth(await login(client, "padm"))
    stf = auth(await login(client, "pstf"))
    wri = auth(await login(client, "pwri"))

    perms = {}
    for name, h in (("admin", adm), ("staff", stf), ("writer", wri)):
        r = await client.get("/whoami", headers=h)
        perms[name] = set(r.json().get("permissions", []))
    check(PERM in perms["admin"] and PERM not in perms["staff"] and PERM not in perms["writer"]
          and "sellers.write" in perms["writer"],
          f"E0: /whoami -- admin holds {PERM}; staff and writer do not; writer holds sellers.write")

    # The fixture seller, created by ADMIN.
    r = await client.post("/sellers", headers=adm, json={
        "code": f"PP-{RUN}", "name": f"personal probe {RUN}", "grade": "B",
        "id_number": ID_MAIN, "address": ADDR_MAIN, "vehicle_no": "1PP 1234"})
    if not check(r.status_code == 201, f"fixture: admin POST /sellers -> 201 (got {r.status_code})"):
        return
    sid = r.json()["id"]
    check(has(r, ID_MAIN) and has(r, ADDR_MAIN),
          "C-control: ADMIN's create echo CONTAINS the ID and the address (the instrument sees them)")

    header("L  GET /sellers")
    ra = await client.get("/sellers", headers=adm)
    check(has(ra, ID_MAIN) and has(ra, ADDR_MAIN),
          "L1 control: admin's raw GET /sellers body contains the fixture's ID and address")
    rs = await client.get("/sellers", headers=stf)
    row = next((s for s in rs.json()["sellers"] if s["id"] == sid), {})
    check(rs.status_code == 200 and not has(rs, ID_MAIN) and not has(rs, ADDR_MAIN),
          "L2: staff's raw GET /sellers body contains NEITHER the ID nor the address")
    check(bool(row) and "id_number" not in row and "address" not in row,
          f"L3: staff's fixture row carries neither KEY (keys={sorted(row)})")
    admin_row = next((s for s in ra.json()["sellers"] if s["id"] == sid), {})
    check(admin_row.get("id_number") == ID_MAIN and admin_row.get("address") == ADDR_MAIN,
          "L4: admin's fixture row carries both keys with the stored values")

    header("C  POST /sellers by staff -- the create echo")
    rc = await client.post("/sellers", headers=stf, json={
        "name": f"staff-made {RUN}", "grade": "B", "id_number": ID_STAFF, "address": ADDR_STAFF})
    check(rc.status_code == 201 and not has(rc, ID_STAFF) and not has(rc, ADDR_STAFF),
          f"C1: staff create -> 201 and the echo's raw body carries neither (got {rc.status_code})")
    staff_sid = rc.json().get("id") if rc.status_code == 201 else None
    check(bool(staff_sid) and await stored_personal(staff_sid) == (ID_STAFF, ADDR_STAFF),
          "C2: the staff create STORED both values (read from Postgres) -- it only did not echo them")
    # The CODE-SUPPLIED branch (master.py's `if body.code is not None` return), a separate
    # return statement from the mint loop C1 takes and the spend R1 takes (nemesis finding 1).
    rcs = await client.post("/sellers", headers=stf, json={
        "code": f"PS-{RUN}", "name": f"staff-coded {RUN}", "grade": "B",
        "id_number": ID_SUPPLIED, "address": ADDR_SUPPLIED})
    check(rcs.status_code == 201 and not has(rcs, ID_SUPPLIED) and not has(rcs, ADDR_SUPPLIED),
          f"C3: staff create with a SUPPLIED code -> 201, echo carries neither (got {rcs.status_code})")

    header("R  the create replay by staff (a reservation spent twice)")
    rr = await client.post("/seller-code-reservations", headers=stf,
                           json={"device_id": str(uuid.uuid4())})
    res = rr.json().get("reservations") if rr.status_code == 200 else None
    if check(isinstance(res, list) and len(res) > 0,
             f"R0: staff reserves codes (status {rr.status_code})"):
        code, token = res[0]["code"], res[0]["token"]
        body = {"code": code, "reservation_token": token, "name": f"replay {RUN}", "grade": "B",
                "id_number": ID_REPLAY, "address": ADDR_REPLAY}
        r1 = await client.post("/sellers", headers=stf, json=body)
        r2 = await client.post("/sellers", headers=stf, json=body)
        check(r1.status_code == 201 and r2.status_code == 200
              and not has(r1, ID_REPLAY) and not has(r2, ID_REPLAY)
              and not has(r1, ADDR_REPLAY) and not has(r2, ADDR_REPLAY),
              f"R1: spend 201 then replay 200, neither raw body carries the ID or the address"
              f" (got {r1.status_code}, {r2.status_code})")

    header("H  GET /sellers/{id}/history by staff")
    rh = await client.get(f"/sellers/{sid}/history", headers=stf)
    check(rh.status_code == 200 and not has(rh, ID_MAIN) and not has(rh, ADDR_MAIN),
          f"H1: staff history -> 200, raw body carries neither (got {rh.status_code})")

    header("X  refusal bodies by staff, each REQUEST carrying the ID")
    rx = await client.post("/sellers", headers=stf, json={
        "code": f"PP-{RUN}", "name": "dup", "grade": "B",
        "id_number": ID_REFUSED, "address": ADDR_REFUSED})
    check(rx.status_code == 409 and detail_of(rx).get("code") == "duplicate_code"
          and not has(rx, ID_REFUSED) and not has(rx, ADDR_REFUSED),
          f"X1: 409 duplicate_code does not hand back the ID or address (got {rx.status_code}"
          f" {detail_of(rx).get('code')!r})")
    long_id = ID_REFUSED * 3   # 39 characters, over the 32 bound
    rv = await client.post("/sellers", headers=stf, json={
        "name": "toolong", "grade": "B", "id_number": long_id, "address": ADDR_REFUSED})
    check(rv.status_code == 422 and not has(rv, ID_REFUSED) and not has(rv, ADDR_REFUSED),
          f"X2: 422 on an over-long id_number does not hand back either value (got {rv.status_code})")
    rp = await client.patch(f"/sellers/{sid}", headers=stf,
                            json={"id_number": ID_REFUSED, "address": ADDR_REFUSED})
    check(rp.status_code == 403 and not has(rp, ID_REFUSED) and not has(rp, ID_MAIN)
          and not has(rp, ADDR_REFUSED),
          f"X3: staff PATCH -> 403 and the body carries no ID (got {rp.status_code})")

    header("D  the writer's deactivate / activate echoes (no GET /sellers/{id} exists)")
    rd = await client.post(f"/sellers/{sid}/deactivate", headers=wri)
    re_ = await client.post(f"/sellers/{sid}/activate", headers=wri)
    check(rd.status_code == 200 and re_.status_code == 200
          and not has(rd, ID_MAIN) and not has(re_, ID_MAIN)
          and not has(rd, ADDR_MAIN) and not has(re_, ADDR_MAIN)
          and "id_number" not in rd.json() and "address" not in re_.json(),
          f"D1: deactivate/activate by the writer carry neither (got {rd.status_code}, {re_.status_code})")

    header("W  an edit without the permission must not erase")
    before = await stored_personal(sid)
    check(before == (ID_MAIN, ADDR_MAIN), "W0: stored values before the edits equal the fixed values")
    rw = await client.patch(f"/sellers/{sid}", headers=wri, json={"name": f"renamed {RUN}"})
    check(rw.status_code == 200 and not has(rw, ID_MAIN) and not has(rw, ADDR_MAIN),
          f"W1: writer PATCH omitting the personal fields -> 200, echo carries neither (got {rw.status_code})")
    check(await stored_personal(sid) == (ID_MAIN, ADDR_MAIN),
          "W2: after it, Postgres holds the SAME id_number and address, value against value")
    rn = await client.patch(f"/sellers/{sid}", headers=wri, json={"id_number": None})
    d = detail_of(rn)
    check(rn.status_code == 403 and d.get("code") == "permission_required"
          and d.get("required_permission") == PERM,
          f"W3: writer PATCH id_number=null -> 403 permission_required naming {PERM}"
          f" (got {rn.status_code} {d.get('code')!r} {d.get('required_permission')!r})")
    ra2 = await client.patch(f"/sellers/{sid}", headers=wri,
                             json={"address": ADDR_WRITER_TRY, "name": f"again {RUN}"})
    d = detail_of(ra2)
    check(ra2.status_code == 403 and d.get("required_permission") == PERM,
          f"W4: writer PATCH with a new address -> 403 naming {PERM} (got {ra2.status_code})")
    after = await stored_personal(sid)
    name_now = await scalar("SELECT name FROM sellers WHERE id = :id", id=uuid.UUID(sid))
    check(after == (ID_MAIN, ADDR_MAIN) and name_now == f"renamed {RUN}",
          "W5: after both refusals Postgres still holds the fixed values, and the refused"
          " request's name change did not land either (refused whole)")
    rok = await client.patch(f"/sellers/{sid}", headers=adm, json={"address": ADDR_ADMIN_EDIT})
    check(rok.status_code == 200 and has(rok, ADDR_ADMIN_EDIT) and has(rok, ID_MAIN)
          and await stored_personal(sid) == (ID_MAIN, ADDR_ADMIN_EDIT),
          f"W6 control: ADMIN may write the address -> 200, the echo carries it and the ID"
          f" (got {rok.status_code})")

    await run_discriminating(client, sid)


async def run_discriminating(client: httpx.AsyncClient, sid: str) -> None:
    header("P  the gate reads sellers.read_personal and nothing else")
    pnot = auth(await login(client, "pnot"))
    pone = auth(await login(client, "pone"))
    stored = await stored_personal(sid)
    rn = await client.get("/sellers", headers=pnot)
    ro = await client.get("/sellers", headers=pone)
    check(rn.status_code == 200 and not has(rn, stored[0]) and not has(rn, stored[1]),
          "P1: a role holding EVERY code but sellers.read_personal (users.manage included)"
          " receives neither value")
    check(ro.status_code == 200 and has(ro, stored[0]) and has(ro, stored[1]),
          "P2: a role holding ONLY sellers.read_personal (+ sellers.write) receives both")
    pn = await client.patch(f"/sellers/{sid}", headers=pnot, json={"address": ADDR_ONLY})
    check(pn.status_code == 403 and detail_of(pn).get("required_permission") == PERM
          and await stored_personal(sid) == stored,
          f"P3: the every-code-but role may NOT write the address -> 403 naming {PERM},"
          f" stored unchanged (got {pn.status_code})")
    po = await client.patch(f"/sellers/{sid}", headers=pone, json={"address": ADDR_ONLY})
    check(po.status_code == 200 and has(po, ADDR_ONLY)
          and await stored_personal(sid) == (stored[0], ADDR_ONLY),
          f"P4: the read_personal-only role may write it -> 200, stored (got {po.status_code})")


async def run_round_trip(scratch: str) -> None:
    header("RT  migration 0024 down / up / refusal, on the scratch")

    async def state() -> tuple[str, int, set[str], set[str]]:
        from sqlalchemy import text
        from app.db import tenant_connection
        async with tenant_connection(None) as conn:
            n = (await conn.execute(text("SELECT count(*) FROM permissions"))).scalar_one()
        head = await mig_scalar(scratch, "SELECT version_num FROM alembic_version")
        holders = set(await mig_list(scratch, "SELECT role_id::text FROM role_permissions"
                                              " WHERE permission = 'users.manage'"))
        granted = set(await mig_list(scratch, "SELECT role_id::text FROM role_permissions"
                                              f" WHERE permission = '{PERM}'"))
        return head, n, holders, granted

    # The P cells' `pone` role holds sellers.read_personal WITHOUT users.manage -- exactly
    # the shop-declared grant the downgrade refuses over (RT3 proves that refusal on purpose).
    # Removed first, on this SCRATCH only, so RT1 measures the mechanics, not the fixture.
    await mig_exec(scratch,
                   f"DELETE FROM role_permissions rp USING roles r WHERE r.id = rp.role_id"
                   f" AND r.code = 'pone-{RUN}' AND rp.permission = '{PERM}'")
    head, n, holders, granted = await state()
    # A SUBSET, not equality: the P cells' `pnot` role holds users.manage and deliberately
    # NOT the grant, so after the cleanup every grant is to a holder but one holder lacks it.
    check(granted <= holders and len(holders - granted) == 1,
          f"RT0: the fixture's extra grant removed; every grant is to a users.manage holder"
          f" ({len(granted)} grants, {len(holders)} holders, the pnot fixture the one without)")
    rc, out = run_alembic(scratch, "downgrade", "0023")
    head, n, holders, granted = await state()
    check(rc == 0 and head == "0023" and n == 15 and not granted,
          f"RT1: downgrade to 0023 exit {rc}: head {head}, {n} codes, {len(granted)} grants of {PERM}")
    rc, out = run_alembic(scratch, "upgrade", HEAD)
    head, n, holders, granted = await state()
    check(rc == 0 and head == HEAD and n == 16 and granted == holders and len(holders) > 0,
          f"RT2: upgrade to {HEAD} exit {rc}: {n} codes, grants == users.manage holders as a set"
          f" ({len(granted)} == {len(holders)})")
    await mig_exec(scratch,
                   "INSERT INTO role_permissions (tenant_id, role_id, permission)"
                   f" SELECT r.tenant_id, r.id, '{PERM}' FROM roles r"
                   f" WHERE r.tenant_id = '{TENANT_A_ID}' AND r.code = 'staff'")
    rc, out = run_alembic(scratch, "downgrade", "0023")
    head, n, holders, granted = await state()
    check(rc != 0 and "grants to a role without users.manage" in out and head == HEAD and n == 16,
          f"RT3: a grant to the staff role -> downgrade REFUSED (exit {rc}), head still {head}")
    await mig_exec(scratch,
                   f"DELETE FROM role_permissions rp USING roles r WHERE r.id = rp.role_id"
                   f" AND r.tenant_id = '{TENANT_A_ID}' AND r.code = 'staff'"
                   f" AND rp.permission = '{PERM}'")
    head, n, holders, granted = await state()
    check(head == HEAD and granted == holders,
          f"RT4: the scratch's extra grant removed; left at {head} with grants == holders")


# The round trip reads and writes as the MIGRATION role (the table owner, NOBYPASSRLS).
# role_permissions is FORCE RLS, so with no tenant the owner reads ZERO rows
# (lessons/a-migration-reads-zero-under-force-rls.md): the cross-tenant read lifts FORCE
# inside one transaction and restores it before commit; the write sets Shop A's tenant
# and the declared system actor (role_permissions is audited).
async def _owner_conn(scratch: str):
    import asyncpg
    url = make_url(ORIG_ENV["MIGRATION_DATABASE_URL"]).set(database=scratch)
    return await asyncpg.connect(user=url.username, password=url.password, host=url.host,
                                 port=url.port, database=scratch)


async def mig_list(scratch: str, sql: str) -> list:
    conn = await _owner_conn(scratch)
    try:
        async with conn.transaction():
            await conn.execute("ALTER TABLE role_permissions NO FORCE ROW LEVEL SECURITY")
            rows = await conn.fetch(sql)
            await conn.execute("ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY")
        return [r[0] for r in rows]
    finally:
        await conn.close()


async def mig_scalar(scratch: str, sql: str):
    conn = await _owner_conn(scratch)
    try:
        return await conn.fetchval(sql)
    finally:
        await conn.close()


async def mig_exec(scratch: str, sql: str) -> None:
    conn = await _owner_conn(scratch)
    try:
        async with conn.transaction():
            await conn.execute(f"SELECT set_config('app.tenant_id', '{TENANT_A_ID}', true)")
            await conn.execute("SELECT set_config('app.actor_id',"
                               " '00000000-0000-0000-0000-000000000000', true)")
            await conn.execute("SELECT set_config('app.actor_username',"
                               " 'system:prove_seller_personal', true)")
            await conn.execute(sql)
    finally:
        await conn.close()


async def main() -> int:
    global BASE
    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    live_name = app_live.database
    scratch = SCRATCH_DB
    if scratch == live_name:
        print(f"REFUSED: the scratch name {scratch!r} equals the live database.")
        return 2

    print(f"  restoring scratch {scratch!r} from a live dump of {live_name!r} (live read-only)...")
    try:
        restore_scratch(live_name, scratch)
    except Exception as exc:  # noqa: BLE001
        print(f"REFUSED: could not restore the scratch: {exc}")
        return 2
    rc, out = run_alembic(scratch, "upgrade", "head")
    if not check(rc == 0, f"E0: alembic upgrade head on the scratch exit {rc}"):
        print(out[-1500:])
        return 1

    os.environ["APP_DATABASE_URL"] = app_live.set(database=scratch).render_as_string(hide_password=False)
    os.environ["DIRECTORY_DATABASE_URL"] = dir_live.set(database=scratch).render_as_string(hide_password=False)

    head = await mig_scalar(scratch, "SELECT version_num FROM alembic_version")
    check(head == HEAD, f"E0: the scratch is at {HEAD} (read from alembic_version: {head})")

    port = free_port()
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_seller_personal_",
                                      delete=False, encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=SERVER_DIR, env=dict(os.environ), stdout=log, stderr=subprocess.STDOUT)
    print(f"  child uvicorn pid={proc.pid} on {BASE} against scratch {scratch!r}")
    try:
        why = wait_for_health(proc)
        if why:
            check(False, f"E0: server started -- {why}")
            return 1
        doc = httpx.get(f"{BASE}/openapi.json", timeout=5.0).json()
        check("patch" in doc.get("paths", {}).get("/sellers/{seller_id}", {}),
              "E0: /openapi.json declares PATCH /sellers/{seller_id}")
        try:
            await provision()
        except Exception as exc:  # noqa: BLE001
            print(f"UNFIT: provisioning failed: {exc!r}")
            return 2
        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            await run_http(client)
    finally:
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

    await run_round_trip(scratch)
    print(f"\n{len(failures)} RED" if failures else "\nALL GREEN")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = asyncio.run(main())
    print(f"PROVE_SELLER_PERSONAL_EXIT={rc}")
    sys.exit(rc)
