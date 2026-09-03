"""Prove the master-data audit log: a write through a real HTTP route produces
exactly one attributed, append-only record, and nothing else can.

    python scripts/prove_audit.py     (a server must be running at API_BASE_URL)

WHAT IT PROVES (migration 0017, ARCHITECTURE D3):
  A1  a price change over PUT /products/{id}/prices/{grade} writes ONE audit row,
      with the acting admin's user_id and username, the table, the action, and the
      money byte-identical to what was stored -- read back OUT OF POSTGRES.
  A2  price history falls out: change a price twice and the intermediate value is
      reconstructable from the log alone.
  RED users.password_hash never appears in the log, with username as the presence
      sibling that proves the search can fire.
  AP  the app role can SELECT the log and can neither UPDATE nor DELETE it
      (append-only at the grant level; the SECURITY DEFINER trigger is sole writer).
  RB  a write in a transaction that ROLLS BACK leaves no audit row -- the trigger
      is in the same transaction.
  XT  a shop cannot read another shop's log (RLS), with a positive control.

  DISPROOFS -- the cell each is aimed at is NAMED before the break:
  Da  drop the actor from the connection -> the write is REFUSED (records NOTHING),
      not written with a null author.
  Dc  make the trigger function SECURITY INVOKER (the wrong way) -> the app role
      cannot write the log, so the audited write itself fails: SECURITY DEFINER is
      load-bearing. (The disproof for a MISSING trigger being noticed in production
      -- reconcile.py S6 -- lives in prove_reconcile.py, on its scratch.)
  Db  drop one table's trigger -> that table's write leaves NO log row (silent).

STATE. The one seeded value it borrows -- PRODUCT_A's grade-D price -- is saved and
restored. Audit rows it writes are NOT deleted (recycle_app holds no DELETE, which
is the point), so every assertion keys on THIS RUN's rows by a timestamp captured
before the write, never on an absolute count -- it passes twice in a row against a
live database (lessons/proof-must-run-twice.md). The DDL disproofs (Dc, Db) run in
a transaction that ROLLS BACK, so the live schema is never changed
(lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database: nothing is
committed here).
"""
from __future__ import annotations

import asyncio
import datetime as dt
import os
import sys
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from dotenv import load_dotenv  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_B_ID,
    TENANT_B_PASSWORD,
)

load_dotenv()

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8137")
RUN = uuid.uuid4().hex[:8]
GRADE = "D"  # a seeded tier we save and restore, so the borrowed price is untouched

_failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK  ' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        _failures.append(label)


def header(text: str) -> None:
    print(f"\n=== {text} ===")


def login(client: httpx.Client, tenant_id, username: str, password: str) -> dict:
    r = client.post(f"{BASE}/auth/login",
                    json={"tenant_id": str(tenant_id), "username": username,
                          "password": password})
    r.raise_for_status()
    body = r.json()
    return {"headers": {"authorization": f"Bearer {body['access_token']}"},
            "user_id": body["user_id"]}


def app_url() -> str:
    return os.environ["APP_DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")


def superuser_dsn() -> str:
    u = make_url(os.environ["APP_DATABASE_URL"])
    return f"postgresql://postgres:postgres@{u.host}:{u.port}/{u.database}"


async def main() -> int:  # noqa: C901 — one linear narrative, deliberately flat
    # The app role, exactly as the runtime reads: RLS-bound, tenant context set
    # session-level so a read sees THIS tenant (and never zero, the FORCE-RLS trap).
    app = await asyncpg.connect(app_url())
    await app.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))
    su = await asyncpg.connect(superuser_dsn())

    saved_price = await app.fetchval(
        "SELECT price FROM product_prices WHERE product_id = $1 AND grade = $2",
        PRODUCT_A_ID, GRADE)
    if saved_price is None:
        print("SETUP FAILED: seeded PRODUCT_A grade-D price not found. Run seed_dev.py.")
        await app.close()
        await su.close()
        return 1

    client = httpx.Client(timeout=20.0)
    try:
        try:
            admin = login(client, TENANT_A_ID, ADMIN_USERNAME, TENANT_A_PASSWORD)
            admin_b = login(client, TENANT_B_ID, ADMIN_USERNAME, TENANT_B_PASSWORD)
        except httpx.HTTPStatusError as e:
            print(f"SETUP FAILED: login returned {e.response.status_code}. Run seed_dev.py.")
            client.close()
            await app.close()
            await su.close()
            return 1

        # ---- helper: this run's audit rows for one (table, product, grade) ----
        async def price_audit_rows(since: dt.datetime) -> list[asyncpg.Record]:
            # new_data->>'price' in SQL, NEVER json.loads in Python: a JSON parse
            # turns the money into a float and loses the exact text, which is the
            # reformatting hard rule 1 forbids. Postgres jsonb ->> returns the
            # numeric's exact string.
            return await app.fetch(
                "SELECT action, actor_user_id, actor_username, table_name,"
                "       new_data->>'price' AS new_price, created_at"
                "  FROM audit_log"
                " WHERE table_name = 'product_prices'"
                "   AND new_data->>'product_id' = $1 AND new_data->>'grade' = $2"
                "   AND created_at > $3 ORDER BY created_at, id",
                str(PRODUCT_A_ID), GRADE, since)

        # ------------------------------------------------------------------ A1
        header("A1: a price change over the REAL route writes ONE attributed record")
        run_start = await app.fetchval("SELECT now()")
        v1 = f"7.{int(RUN[:2], 16) % 100:02d}"        # unique-ish, 2dp, harmless
        r = client.put(f"{BASE}/products/{PRODUCT_A_ID}/prices/{GRADE}",
                       headers=admin["headers"], json={"price": v1})
        check("PUT a price -> 200", r.status_code == 200, f"status={r.status_code}")
        check("and the READ endpoint shows it — this is not a vacuous test",
              r.json().get("prices", {}).get(GRADE) == v1, f"prices={r.json().get('prices')}")

        rows = await price_audit_rows(run_start)
        check("exactly ONE audit row for this price change", len(rows) == 1,
              f"rows={len(rows)}")
        if rows:
            row = rows[0]
            check("the actor is the admin who did it, by user_id",
                  str(row["actor_user_id"]) == str(admin["user_id"]),
                  f"logged={row['actor_user_id']} admin={admin['user_id']}")
            check("and by username snapshot",
                  row["actor_username"] == ADMIN_USERNAME,
                  f"username={row['actor_username']}")
            check("the action is the write that happened",
                  row["action"] in ("INSERT", "UPDATE"), f"action={row['action']}")
            stored = await app.fetchval(
                "SELECT price::text FROM product_prices WHERE product_id=$1 AND grade=$2",
                PRODUCT_A_ID, GRADE)
            check("the money in the log is byte-identical to the stored price",
                  row["new_price"] == stored == v1,
                  f"log={row['new_price']!r} stored={stored!r} put={v1!r}")

        # ------------------------------------------------------------------ A2
        header("A2: price history falls out — the intermediate value is in the log")
        v2 = f"8.{int(RUN[2:4], 16) % 100:02d}"
        r = client.put(f"{BASE}/products/{PRODUCT_A_ID}/prices/{GRADE}",
                       headers=admin["headers"], json={"price": v2})
        check("the second price change landed -> 200", r.status_code == 200,
              f"status={r.status_code}")
        rows = await price_audit_rows(run_start)
        prices_in_order = [x["new_price"] for x in rows]
        check("the log holds BOTH prices in the order they were set",
              prices_in_order[-2:] == [v1, v2], f"sequence={prices_in_order}")
        # Reconstruct: what was the price BEFORE the last change? The log alone says.
        reconstructed_intermediate = prices_in_order[-2] if len(prices_in_order) >= 2 else None
        check("the intermediate price is reconstructable from the log alone",
              reconstructed_intermediate == v1,
              f"reconstructed={reconstructed_intermediate} expected={v1}")

        # ------------------------------------------------------------------ RED
        header("RED: no password material reaches the log; username is the control")
        uname = f"audit-{RUN}"
        r = client.post(f"{BASE}/users", headers=admin["headers"], json={
            "username": uname, "full_name": "Audit Proof User",
            "role": "staff", "password": f"pw-{RUN}-longenough"})
        check("POST /users -> 201", r.status_code == 201, f"status={r.status_code}")
        urows = await app.fetch(
            "SELECT new_data, old_data FROM audit_log"
            " WHERE table_name='users' AND new_data->>'username' = $1", uname)
        check("the user create produced a users audit row", len(urows) >= 1,
              f"rows={len(urows)}")
        blob = " ".join((x["new_data"] or "") + (x["old_data"] or "") for x in urows)
        check("no 'password_hash' key appears in any users audit row",
              "password_hash" not in blob, "found the redacted key")
        check("presence sibling: the username IS in the row, so the search can fire",
              uname in blob, "the search found nothing at all — it may be blind")

        # ------------------------------------------------------------------ AP
        header("AP: append-only — the app role reads the log but cannot change it")
        can_select = True
        try:
            await app.fetch("SELECT count(*) FROM audit_log")
        except asyncpg.PostgresError:
            can_select = False
        check("the app role CAN SELECT the log (positive control)", can_select)
        for op, sql in (("UPDATE", "UPDATE audit_log SET actor_username = 'x'"),
                        ("DELETE", "DELETE FROM audit_log")):
            refused = False
            try:
                await app.execute(sql)
            except asyncpg.InsufficientPrivilegeError:
                refused = True
            except asyncpg.PostgresError as e:  # any refusal is the pass
                refused = "permission denied" in str(e).lower()
            check(f"the app role is REFUSED {op} on the log", refused)

        # ------------------------------------------------------------------ RB
        header("RB: a rolled-back write leaves NO audit row (same transaction)")
        sentinel = f"6.{int(RUN[4:6], 16) % 100:02d}"
        rb_start = await app.fetchval("SELECT now()")
        tx = app.transaction()
        await tx.start()
        try:
            await app.execute("SELECT set_config('app.actor_id', $1, true)",
                              "00000000-0000-0000-0000-000000000000")
            await app.execute("SELECT set_config('app.actor_username', $1, true)",
                              "system:prove_audit")
            await app.execute(
                "UPDATE product_prices SET price = $1 WHERE product_id = $2 AND grade = $3",
                Decimal(sentinel), PRODUCT_A_ID, GRADE)
        finally:
            await tx.rollback()
        # actor GUCs were SET LOCAL, so they are gone after the rollback; re-set the
        # tenant is not needed (session-level). Read for the sentinel.
        leaked = await app.fetch(
            "SELECT 1 FROM audit_log WHERE table_name='product_prices'"
            " AND new_data->>'grade' = $1 AND new_data->>'price' = $2 AND created_at > $3",
            GRADE, sentinel, rb_start)
        check("the rolled-back price change left no audit row", len(leaked) == 0,
              f"rows={len(leaked)}")

        # ------------------------------------------------------------------ XT
        header("XT: a shop cannot read another shop's log (RLS), with a control")
        marker = json_price = v2  # a price only tenant A has changed this run
        await app.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))
        a_sees = await app.fetchval(
            "SELECT count(*) FROM audit_log WHERE table_name='product_prices'"
            " AND new_data->>'product_id' = $1 AND new_data->>'price' = $2",
            str(PRODUCT_A_ID), marker)
        check("tenant A CAN see its own log rows (positive control)", a_sees >= 1,
              f"count={a_sees}")
        await app.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_B_ID))
        b_sees = await app.fetchval(
            "SELECT count(*) FROM audit_log WHERE table_name='product_prices'"
            " AND new_data->>'product_id' = $1 AND new_data->>'price' = $2",
            str(PRODUCT_A_ID), marker)
        check("tenant B canNOT see tenant A's log rows (RLS)", b_sees == 0,
              f"count={b_sees}")
        await app.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))

        # ------------------------------------------------------------------ Da
        header("Da: DISPROOF — drop the actor -> the write is REFUSED, records NOTHING")
        # NAMED FIRST: the cell that must move is 'a write with no actor is refused'.
        da_start = await app.fetchval("SELECT now()")
        raised, control_ok = False, False
        tx = app.transaction()
        await tx.start()
        try:
            # tenant set (session), actor DELIBERATELY NOT set
            await app.execute(
                "UPDATE product_prices SET price = price WHERE product_id=$1 AND grade=$2",
                PRODUCT_A_ID, GRADE)
        except asyncpg.PostgresError as e:
            raised = "no actor in context" in str(e).lower()
        finally:
            await tx.rollback()
        check("a write to an audited table with NO actor is refused by the trigger",
              raised, "the trigger did NOT refuse — an unattributed write got through")
        # control: the SAME write WITH an actor set is accepted (then rolled back).
        tx = app.transaction()
        await tx.start()
        try:
            await app.execute("SELECT set_config('app.actor_id', $1, true)",
                              "00000000-0000-0000-0000-000000000000")
            await app.execute("SELECT set_config('app.actor_username', $1, true)",
                              "system:prove_audit")
            await app.execute(
                "UPDATE product_prices SET price = price WHERE product_id=$1 AND grade=$2",
                PRODUCT_A_ID, GRADE)
            control_ok = True
        except asyncpg.PostgresError:
            control_ok = False
        finally:
            await tx.rollback()
        check("control: the SAME write WITH an actor is accepted", control_ok,
              "the actor path is broken — the refusal above proves nothing")
        no_rows = await app.fetch(
            "SELECT 1 FROM audit_log WHERE created_at > $1", da_start)
        check("and no audit row was written by the refused write (rolled back too)",
              len(no_rows) == 0, f"rows={len(no_rows)}")

        # ------------------------------------------------------------------ Dc
        header("Dc: DISPROOF — SECURITY INVOKER (wrong way) -> the audited write FAILS")
        # NAMED FIRST: the cell that must move is 'the price change succeeds and logs'.
        # Run as superuser in a transaction that ROLLS BACK: flip to INVOKER, act AS
        # the app role, attempt the write; the trigger then runs as recycle_app,
        # which holds no INSERT on audit_log, so the write is refused.
        invoker_broke = False
        tx = su.transaction()
        await tx.start()
        try:
            await su.execute("ALTER FUNCTION audit_capture() SECURITY INVOKER")
            await su.execute("SET ROLE recycle_app")
            await su.execute("SELECT set_config('app.tenant_id', $1, true)", str(TENANT_A_ID))
            await su.execute("SELECT set_config('app.actor_id', $1, true)",
                             "00000000-0000-0000-0000-000000000000")
            await su.execute("SELECT set_config('app.actor_username', $1, true)",
                             "system:prove_audit")
            try:
                await su.execute(
                    "UPDATE product_prices SET price = price WHERE product_id=$1 AND grade=$2",
                    PRODUCT_A_ID, GRADE)
            except asyncpg.PostgresError as e:
                invoker_broke = "permission denied" in str(e).lower()
        finally:
            # The failed UPDATE aborts the transaction, so RESET ROLE cannot run
            # until it ends. Roll back first (which reverts the ALTER FUNCTION AND
            # the SET ROLE, both transactional), then reset defensively.
            await tx.rollback()
            try:
                await su.execute("RESET ROLE")
            except asyncpg.PostgresError:
                pass
        check("under SECURITY INVOKER the app-role audited write is refused"
              " — so SECURITY DEFINER is load-bearing", invoker_broke,
              "the write did NOT fail; the DEFINER choice is not what makes it work")
        secdef = await su.fetchval(
            "SELECT prosecdef FROM pg_proc WHERE proname='audit_capture'")
        check("and the live function is back to SECURITY DEFINER (rollback held)",
              secdef is True, f"prosecdef={secdef}")

        # ------------------------------------------------------------------ Db
        header("Db: DISPROOF — drop a table's trigger -> its write leaves NO record")
        # NAMED FIRST: the cell is 'product_prices produces one log row per change'.
        # In a rolled-back superuser transaction, drop the trigger and do a write:
        # no audit row appears. In production this silent loss is caught by
        # reconcile.py S6 (proven in prove_reconcile.py).
        db_missing = False
        tx = su.transaction()
        await tx.start()
        try:
            before = await su.fetchval("SELECT count(*) FROM audit_log")
            await su.execute("DROP TRIGGER audit_capture ON product_prices")
            await su.execute("SELECT set_config('app.tenant_id', $1, true)", str(TENANT_A_ID))
            await su.execute("SELECT set_config('app.actor_id', $1, true)",
                             "00000000-0000-0000-0000-000000000000")
            await su.execute("SELECT set_config('app.actor_username', $1, true)",
                             "system:prove_audit")
            await su.execute(
                "UPDATE product_prices SET price = price WHERE product_id=$1 AND grade=$2",
                PRODUCT_A_ID, GRADE)
            after = await su.fetchval("SELECT count(*) FROM audit_log")
            db_missing = (before == after)
        finally:
            await tx.rollback()   # restores the trigger; nothing is committed
        check("with the trigger dropped, the price change wrote NO audit row"
              " (silent loss — reconcile S6 is the production detector)", db_missing)
        trg = await su.fetchval(
            "SELECT count(*) FROM pg_trigger WHERE tgname='audit_capture'"
            " AND tgrelid='public.product_prices'::regclass AND NOT tgisinternal")
        check("and the trigger is back on product_prices (rollback held)", trg == 1,
              f"triggers={trg}")

    finally:
        # restore the borrowed price (through the app path is not needed; a direct
        # write with an actor is enough, and it is itself audited honestly).
        await app.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))
        await app.execute("SELECT set_config('app.actor_id', $1, false)",
                          "00000000-0000-0000-0000-000000000000")
        await app.execute("SELECT set_config('app.actor_username', $1, false)",
                          "system:prove_audit")
        await app.execute(
            "UPDATE product_prices SET price = $1 WHERE product_id = $2 AND grade = $3",
            Decimal(saved_price), PRODUCT_A_ID, GRADE)
        restored = await app.fetchval(
            "SELECT price FROM product_prices WHERE product_id=$1 AND grade=$2",
            PRODUCT_A_ID, GRADE)
        print(f"\n  restored PRODUCT_A/{GRADE} price to {restored}")
        if restored != saved_price:
            _failures.append("the borrowed price was not restored")
        client.close()
        await app.close()
        await su.close()

    print()
    if _failures:
        print(f"FAILED — {len(_failures)} check(s): {_failures}")
        return 1
    print("  ALL CASES PASSED — every master-data write is recorded, attributed,"
          " append-only, and tenant-isolated.")
    return 0


if __name__ == "__main__":
    code = asyncio.run(main())
    print(f"AUDIT_EXIT={code}")
    sys.exit(code)
