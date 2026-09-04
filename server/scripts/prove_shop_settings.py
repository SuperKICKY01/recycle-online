"""prove_shop_settings.py -- GET/PATCH /shop over real HTTP, with the two new
fields (address, phone) added by migration 0013 and master.py's ShopUpdate.

UPDATED 2026-08-31 (P1.23 item 4, unit 2): migration 0014 added a third field to
this surface, tenants.staff_money_visible, so GET /shop now returns SIX keys and
the identity gate + E1 exact-key set are widened to include it. Its BEHAVIOUR (the
dashboard money gate) is proven in prove_reports_summary.py, not here; this file
only keeps its exact-key assertion honest against the widened row.

WHAT THIS TALKS TO, ESTABLISHED BEFORE ANY CELL. It starts its OWN uvicorn on a
free port (never a fixed one -- lessons/a-proof-must-establish-what-it-is-talking-
to.md: a hardcoded 8137 once met a stale server), watches the child rather than
only the clock, and fetches /openapi.json to confirm the server runs THIS code:
the ShopUpdate request schema must carry `address` and `phone`, which the
pre-0013 code did not. A server that does not declare them is not the server this
proof is about, and the run stops before any cell is read.

WHAT DATABASE. The dev `recycle` database on 5544, the one server/.env names, and
NOT a scratch copy. The only write is to tenants.address / tenants.phone on the
seeded Shop A -- which hard rule 5 does not protect (it is not a transaction) --
and the finally restores both to the values read at entry. default_grade and name
are never written.

REPEATABLE. Every assertion is about a ROUND TRIP (what was PATCHed comes back
from GET and from Postgres) or about a refusal, so none depends on the fixture's
starting values; the finally restores address and phone to their entry values and
the run passes twice with no reseed (lessons/proof-must-run-twice.md).

THE 422 BODY DOES NOT ECHO THE VALUE. main.py's validation_error_handler removes
pydantic's `input` from every validation error API-wide
(lessons/a-refusal-hands-back-what-it-refused.md), so E6/E7 assert `input` is
ABSENT while the field name in `loc` is PRESENT -- the presence sibling that keeps
the absence from being vacuous
(lessons/a-check-that-never-went-red-was-never-observed.md, ninth mechanism).
This CORRECTS the phase brief, which expected the echo to be present: it is not,
because the handler redacts it, which is the safer outcome.

THE THAI IS COMPARED IN BYTES. This box is codepage 874, so a Thai address judged
by the console reads as corrupt; E3 compares the HEX Postgres stores against the
hex of the bytes sent, with an ASCII phone as the control down the same path
(lessons/console-is-not-the-observation.md). No cell prints raw Thai.

EXIT IS RED UNLESS THE FULL SUCCESS PATH IS REACHED. main() returns 1 on any
failure and 0 only at the very end; a crash prints no EXIT line at all, and an
ABSENT exit line is the failure signal, never a silent pass
(lessons/a-check-that-never-went-red-was-never-observed.md).

THE DISPROOF (performed by the operator, recorded in the phase report). Change
update_shop's `Depends(require_admin)` to `Depends(get_principal)` and re-run:
EXACTLY the staff-403 cell (E8) reddens, printing the 200 it got, and every other
cell stays green. Revert and it is green again. That control says E8 is about the
ROLE GATE, not the status code. The disproof writes only tenants.address on Shop A
through the real path, which the finally restores; nothing hard rule 5 protects is
touched (lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md).

Usage (from server/, db up, seeded with scripts/seed_dev.py):
    python scripts/prove_shop_settings.py
"""
from __future__ import annotations

import asyncio
import os
import socket
import subprocess
import sys
import tempfile
import time

import httpx

_SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _SERVER_DIR)

from sqlalchemy import text  # noqa: E402

from app.db import SYSTEM_ACTOR_ID, tenant_connection  # noqa: E402
from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    STAFF_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_A_STAFF_PASSWORD,
)

BASE = ""

# A realistic Thai shop address (non-ASCII on purpose, the CP874 hazard) and an
# ASCII phone, the control down the same write path. A second address exercises
# the E7 positive control. These are compared and hex-compared, never printed raw.
TH_ADDRESS = "เลขที่ 42 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110"
TH_ADDRESS_2 = "99/1 หมู่ 4 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540"
PHONE_1 = "02-123-4567"
PHONE_2 = "081-234-5678"

failures: list[str] = []


def check(cond: bool, label: str) -> None:
    if not cond:
        failures.append(label)
    print(f"  [{'ok ' if cond else 'RED'}] {label}")


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


def wait_for_health(proc: subprocess.Popen, timeout: float = 30.0) -> str:
    """Watch the CHILD, not just the clock: a dead child fails immediately."""
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
    """Identity, not liveness: the ShopUpdate schema must carry the new fields."""
    try:
        r = httpx.get(f"{BASE}/openapi.json", timeout=5.0)
    except httpx.HTTPError as exc:
        return f"/openapi.json unreachable: {exc}"
    if r.status_code != 200:
        return f"/openapi.json returned {r.status_code}"
    doc = r.json()
    shop = doc.get("paths", {}).get("/shop", {})
    if "get" not in shop or "patch" not in shop:
        return "the server does not declare GET and PATCH /shop"
    props = (
        doc.get("components", {})
        .get("schemas", {})
        .get("ShopUpdate", {})
        .get("properties", {})
    )
    # staff_money_visible was added by migration 0014 (P1.23 item 4, unit 2): GET
    # /shop now returns it and PATCH /shop accepts it, so the identity gate requires
    # it too -- a server that does not declare it is the pre-0014 code and its E1
    # exact-key assertion below would go red for the wrong reason.
    missing = [k for k in ("address", "phone", "staff_money_visible") if k not in props]
    if missing:
        return (
            "ShopUpdate does not declare " + ", ".join(missing)
            + " -- this server predates migration 0013/0014"
        )
    return ""


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def login(client: httpx.AsyncClient, username: str, password: str) -> str:
    r = await client.post(
        "/auth/login",
        json={
            "tenant_id": str(TENANT_A_ID),
            "username": username,
            "password": password,
        },
    )
    r.raise_for_status()
    return r.json()["access_token"]


async def read_shop() -> dict:
    async with tenant_connection(TENANT_A_ID) as conn:
        row = (
            await conn.execute(
                text("SELECT id, name, default_grade, address, phone FROM tenants")
            )
        ).mappings().one()
        return dict(row)


async def read_shop_hex() -> dict:
    """The hex Postgres stores, from the authority -- never the console."""
    async with tenant_connection(TENANT_A_ID) as conn:
        row = (
            await conn.execute(
                text(
                    "SELECT"
                    " encode(convert_to(coalesce(address,''),'UTF8'),'hex') AS a_hex,"
                    " encode(convert_to(coalesce(phone,''),'UTF8'),'hex') AS p_hex"
                    " FROM tenants"
                )
            )
        ).mappings().one()
        return dict(row)


async def restore_shop(address, phone) -> None:
    async with tenant_connection(
        TENANT_A_ID, actor_id=SYSTEM_ACTOR_ID,
        actor_username="system:prove_shop_settings",
    ) as conn:
        await conn.execute(
            text("UPDATE tenants SET address = :a, phone = :p"),
            {"a": address, "p": phone},
        )


async def main() -> int:
    global BASE
    port = free_port()
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(
        mode="w", suffix=".log", prefix="prove_shop_settings_",
        delete=False, encoding="utf-8",
    )
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=_SERVER_DIR, env=dict(os.environ),
        stdout=log, stderr=subprocess.STDOUT,
    )
    print(f"  child uvicorn pid={proc.pid} on {BASE} (log {log.name})")

    baseline = None
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
        check(True, "E0: /openapi.json declares GET+PATCH /shop and ShopUpdate "
                    "carries address+phone+staff_money_visible")

        baseline = await read_shop()
        print(f"      baseline (from Postgres): address={baseline['address']!r} "
              f"phone={baseline['phone']!r} default_grade={baseline['default_grade']!r}")

        async with httpx.AsyncClient(base_url=BASE, timeout=10.0) as client:
            admin = await login(client, ADMIN_USERNAME, TENANT_A_PASSWORD)
            staff = await login(client, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
            print("      logged in: admin and staff tokens obtained")

            # ---- E1: staff can READ; the body is the shop's, no person named ----
            r = await client.get("/shop", headers=_auth(staff))
            body = r.json()
            print(f"      E1 operands: status={r.status_code} keys={sorted(body)}")
            check(r.status_code == 200, f"E1: staff GET /shop -> 200 (got {r.status_code})")
            # `branch` and `branch_count` since migration 0018: the caller's yard
            # and the derived switch. A branch names no person either -- its
            # object is exactly the branch's own identity, asserted below.
            check(
                set(body) == {"id", "name", "default_grade", "address", "phone",
                              "staff_money_visible", "branch", "branch_count"},
                f"E1: body keys are exactly the shop's and none names a person "
                f"(keys={sorted(body)})",
            )
            branch = body.get("branch")
            check(
                isinstance(branch, dict)
                and set(branch) == {"id", "code", "name", "doc_prefix", "is_active"}
                and isinstance(body.get("branch_count"), int),
                "E1: the branch object is the yard's own identity (id, code, name,"
                f" doc_prefix, is_active) and branch_count is an int"
                f" (branch_keys={sorted(branch) if isinstance(branch, dict) else branch},"
                f" branch_count={body.get('branch_count')!r})",
            )
            check(
                body.get("address") == baseline["address"]
                and body.get("phone") == baseline["phone"],
                "E1: GET reflects the stored baseline "
                f"(addr_match={body.get('address') == baseline['address']}, "
                f"phone_match={body.get('phone') == baseline['phone']})",
            )

            # ---- E2: admin PATCH {address, phone} -> 200; re-GET returns them ----
            r = await client.patch(
                "/shop", headers=_auth(admin),
                json={"address": TH_ADDRESS, "phone": PHONE_1},
            )
            pbody = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            print(f"      E2 operands: status={r.status_code} "
                  f"resp_addr_match={pbody.get('address') == TH_ADDRESS} "
                  f"resp_phone_match={pbody.get('phone') == PHONE_1}")
            check(r.status_code == 200, f"E2: admin PATCH address+phone -> 200 (got {r.status_code})")
            check(
                pbody.get("address") == TH_ADDRESS and pbody.get("phone") == PHONE_1,
                "E2: the PATCH response returns the values sent "
                f"(addr_match={pbody.get('address') == TH_ADDRESS}, "
                f"phone_match={pbody.get('phone') == PHONE_1})",
            )
            g = (await client.get("/shop", headers=_auth(staff))).json()
            check(
                g.get("address") == TH_ADDRESS and g.get("phone") == PHONE_1,
                "E2: a re-GET witnesses the stored values "
                f"(addr_match={g.get('address') == TH_ADDRESS}, "
                f"phone_match={g.get('phone') == PHONE_1})",
            )

            # ---- E3: what Postgres STORED, compared in bytes (Thai) + control ----
            hexes = await read_shop_hex()
            want_a = TH_ADDRESS.encode("utf-8").hex()
            want_p = PHONE_1.encode("utf-8").hex()
            print(f"      E3 operands: db_a_hex={hexes['a_hex']}")
            print(f"                   want_a_hex={want_a}")
            print(f"      E3 control : db_p_hex={hexes['p_hex']} want_p_hex={want_p}")
            check(
                hexes["a_hex"] == want_a,
                "E3: Postgres stored the Thai address byte-for-byte "
                "(hex from convert_to(...,'UTF8'), never the console)",
            )
            check(
                hexes["p_hex"] == want_p,
                "E3: ASCII phone control stored byte-for-byte down the same path",
            )

            # ---- E4: PARTIAL -- phone-only PATCH leaves address untouched ----
            r = await client.patch("/shop", headers=_auth(admin), json={"phone": PHONE_2})
            g = (await client.get("/shop", headers=_auth(admin))).json()
            print(f"      E4 operands: status={r.status_code} "
                  f"phone_now_match={g.get('phone') == PHONE_2} "
                  f"addr_unchanged={g.get('address') == TH_ADDRESS}")
            check(r.status_code == 200, f"E4: partial PATCH (phone only) -> 200 (got {r.status_code})")
            check(g.get("phone") == PHONE_2, "E4: phone updated to the new value")
            check(
                g.get("address") == TH_ADDRESS,
                "E4: a phone-only PATCH leaves address UNCHANGED (partial semantics)",
            )

            # ---- E5: CLEAR -- PATCH address:null empties it, phone untouched ----
            r = await client.patch("/shop", headers=_auth(admin), json={"address": None})
            g = (await client.get("/shop", headers=_auth(admin))).json()
            row = await read_shop()
            print(f"      E5 operands: status={r.status_code} "
                  f"get_addr={g.get('address')!r} db_addr={row['address']!r} "
                  f"phone_untouched={g.get('phone') == PHONE_2}")
            check(r.status_code == 200, f"E5: PATCH address:null -> 200 (got {r.status_code})")
            check(g.get("address") is None, "E5: GET shows address cleared to null")
            check(row["address"] is None, "E5: Postgres address is NULL after the clear")
            check(g.get("phone") == PHONE_2, "E5: clearing address left phone untouched")

            # ---- E6: over-bound address -> 422, field named, value NOT echoed ----
            over = "x" * 501
            r = await client.patch("/shop", headers=_auth(admin), json={"address": over})
            err = ((r.json().get("detail") or [{}]))[0]
            print(f"      E6 operands: status={r.status_code} type={err.get('type')} "
                  f"loc={err.get('loc')} input_present={'input' in err}")
            check(r.status_code == 422, f"E6: over-bound address (501 chars) -> 422 (got {r.status_code})")
            check(list(err.get("loc", [])) == ["body", "address"],
                  f"E6: the 422 names the field in loc (loc={err.get('loc')})")
            check(err.get("type") == "string_too_long",
                  f"E6: type is string_too_long (type={err.get('type')})")
            check("msg" in err, "E6: msg is present (the presence sibling)")
            check(
                "input" not in err,
                "E6: the 422 does NOT echo the rejected value -- main.py "
                "validation_error_handler redacts `input` API-wide",
            )

            # ---- E7: a `name` key is a 422 (immutable by decision, 9ad225e) ----
            r = await client.patch("/shop", headers=_auth(admin), json={"name": "Renamed Shop"})
            err = ((r.json().get("detail") or [{}]))[0]
            print(f"      E7 operands: status={r.status_code} type={err.get('type')} "
                  f"loc={err.get('loc')} input_present={'input' in err}")
            check(r.status_code == 422, f"E7: PATCH with a `name` key -> 422 (got {r.status_code})")
            check(err.get("type") == "extra_forbidden",
                  f"E7: type is extra_forbidden (type={err.get('type')})")
            check(list(err.get("loc", [])) == ["body", "name"],
                  f"E7: loc names the forbidden `name` key (loc={err.get('loc')})")
            check("input" not in err, "E7: the 422 does NOT echo the rejected value")
            # positive control: a valid field IS accepted, so E7's 422 is the key
            # and not a dead endpoint.
            rc = await client.patch("/shop", headers=_auth(admin), json={"address": TH_ADDRESS_2})
            check(rc.status_code == 200,
                  f"E7 control: a valid PATCH (address) -> 200, so E7 refuses the "
                  f"`name` key and not a broken route (got {rc.status_code})")

            # ---- E8: staff PATCH -> 403, pinned to detail.code (the disproof cell) ----
            r = await client.patch("/shop", headers=_auth(staff),
                                    json={"address": "staff-should-not-set"})
            detail = r.json().get("detail", {})
            code = detail.get("code") if isinstance(detail, dict) else None
            print(f"      E8 operands: status={r.status_code} code={code!r}")
            check(r.status_code == 403,
                  f"E8: staff PATCH /shop -> 403 (got {r.status_code})")
            check(code == "admin_required",
                  f"E8: refusal pinned to detail.code, not the status (code={code!r})")

        return 1 if failures else 0
    finally:
        if baseline is not None:
            try:
                await restore_shop(baseline["address"], baseline["phone"])
                after = await read_shop()
                ok = (after["address"] == baseline["address"]
                      and after["phone"] == baseline["phone"])
                print(f"      finally: address/phone restored to baseline (ok={ok})")
                if not ok:
                    failures.append("finally restore did not return to baseline")
            except Exception as exc:  # noqa: BLE001 -- record, do not mask
                print(f"  [RED] finally restore raised: {exc!r}")
                failures.append("finally restore raised")
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


if __name__ == "__main__":
    rc = asyncio.run(main())
    print(f"PROVE_SHOP_SETTINGS_EXIT={rc}")
    sys.exit(rc)
