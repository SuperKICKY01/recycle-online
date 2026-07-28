"""Prove the backup round trip is real, and that the proof itself is not vacuous.

    python scripts/prove_backup_restore.py     (from the server/ directory)

A backup that has never been restored is a file, not a backup. This runs the two
operator scripts end to end and checks the restored copy against the source.

THE VACUITY PROBLEM
-------------------
"Restore, then compare restored against source" passes trivially if the
verification queries accidentally read the LIVE database — a restore that did
nothing at all would look perfect. So the source is MUTATED after the dump is
taken, and the restored copy must reflect THE DUMP'S MOMENT, not the source's:

    * a marker bill inserted after the dump must be PRESENT in the source and
      ABSENT in the restored copy;
    * the doc_no counter must read one HIGHER in the source than in the restore.

If a check ever reads the wrong database those two invert or collapse, and they
are the first thing to look at when this proof goes green after a change.

WHAT IS COMPARED
----------------
    P0  pick a real pre-existing bill as the witness; record counts + counter
    P1  scripts/backup_db.py -> a dump whose per-table row counts come from
        the FILE, not from either database
    P2  mutate the source (marker bill + counter bump) AFTER the dump
    P3  scripts/restore_db.py -> a scratch database, live data untouched
    P4  restored == the dump's moment, and != the source's:
          - row counts per table
          - the doc_no counter (source is +1)
          - the marker bill: in the source, not in the restore
          - the witness bill and every item, every money and weight column
            compared as TEXT, digit for digit
          - Thai master data compared as UTF-8 HEX, never by eye
          - alembic_version
          - RLS still binds in the restored copy, checked by connecting as
            recycle_app: no tenant context sees zero rows, tenant A sees
            exactly tenant A

The proof leaves its own dump directory and the scratch database in place as
evidence; both are safe to delete (the last lines say how).
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlparse, urlunparse

SERVER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_DIR))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.bills import _be_year  # noqa: E402  (one BE-year source; never re-derive +543)
from app.config import APP_DATABASE_URL  # noqa: E402
from app.db import engine, tenant_connection  # noqa: E402
from app.seeddata import PRODUCT_A_ID, SELLER_A_ID, TENANT_A_ID, TENANT_B_ID  # noqa: E402

CONTAINER = os.environ.get("RECYCLE_PG_CONTAINER", "recycle_pg")
SCRATCH_DB = "recycle_restore_scratch"
SUPERUSER = "postgres"

failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK  ' if ok else 'FAIL'}] {label}{' — ' + detail if detail else ''}")
    if not ok:
        failures.append(label)


# ---------------------------------------------------------------------------
# talking to Postgres as the superuser, through the container
# ---------------------------------------------------------------------------
def psql(db: str, sql: str) -> list[str]:
    """One-line SQL, raw bytes, decoded as UTF-8 explicitly.

    Single line because multi-line text passed as a shell argument is mangled
    on this box; UTF-8 explicitly because the locale default here is cp874 and
    would render correct Thai as mojibake (CLAUDE.md).
    """
    if "\n" in sql:
        raise ValueError("SQL passed as an argument must be a single line")
    cp = subprocess.run(
        ["docker", "exec", "-e", "PGCLIENTENCODING=UTF8", CONTAINER,
         "psql", "-U", SUPERUSER, "-d", db, "-Atq", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True,
    )
    if cp.returncode != 0:
        raise RuntimeError(f"psql({db}) failed: {cp.stderr.decode('utf-8', errors='replace')}")
    out = cp.stdout.decode("utf-8").replace("\r\n", "\n").strip("\n")
    return [line for line in out.split("\n") if line != ""]


def scalar(db: str, sql: str) -> str | None:
    rows = psql(db, sql)
    return rows[0] if rows else None


def table_names(db: str) -> list[str]:
    return psql(
        db,
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = 'public' and c.relkind = 'r' order by 1",
    )


def row_counts(db: str, tables: list[str]) -> dict[str, int]:
    sql = " union all ".join(
        f"select '{t}' || '=' || count(*)::text from public.{t}" for t in tables
    ) + " order by 1"
    return {line.split("=")[0]: int(line.split("=")[1]) for line in psql(db, sql)}


# Timestamps are pinned to UTC in the session so the two databases render them
# identically no matter what the container's default TimeZone is; every money
# and weight column is cast to TEXT so the comparison is on DIGITS, never on a
# float that happens to print the same.
_BILL_COLS = ("set time zone 'UTC'; select row_to_json(t) from (select id::text, doc_no,"
              " seller_id::text, vehicle_no, idempotency_key, total_amount::text,"
              " device_created_at::text, server_received_at::text, voided_at::text,"
              " voided_by::text, void_reason from public.purchase_bills where id = '{id}') t")
_ITEM_COLS = ("set time zone 'UTC'; select row_to_json(t) from (select id::text, line_no,"
              " product_id::text, gross_weight::text, tare_weight::text, net_weight::text,"
              " unit_price::text, list_price::text, amount::text from public.purchase_bill_items"
              " where bill_id = '{id}' order by line_no) t")


def bill_row(db: str, bill_id: str) -> dict | None:
    rows = psql(db, _BILL_COLS.format(id=bill_id))
    return json.loads(rows[0]) if rows else None


def item_rows(db: str, bill_id: str) -> list[dict]:
    return [json.loads(r) for r in psql(db, _ITEM_COLS.format(id=bill_id))]


def thai_hex(db: str, tenant_id: uuid.UUID) -> list[str]:
    """Master-data names as UTF-8 HEX.

    Never compare Thai by eye out of a console on this box — codepage 874 makes
    correct UTF-8 look corrupt (lessons/console-is-not-the-observation.md). Hex
    is the observation; the glyphs are an opinion.
    """
    return psql(
        db,
        "select 's:' || code || '=' || encode(convert_to(name,'UTF8'),'hex') from public.sellers"
        f" where tenant_id = '{tenant_id}' union all select 'p:' || code || '=' ||"
        f" encode(convert_to(name,'UTF8'),'hex') from public.products where tenant_id ="
        f" '{tenant_id}' order by 1",
    )


# ---------------------------------------------------------------------------
# fixture: write a bill through the app role, under tenant context
# ---------------------------------------------------------------------------
async def insert_bill(tenant_id: uuid.UUID, note: str) -> dict:
    """Insert one bill + one item as recycle_app under SET LOCAL, like the runtime.

    This is a proof FIXTURE writing rows, not a second implementation of bill
    creation: the claim under test is where the dump's snapshot falls, not how
    a bill is priced. It does take the gap-free counter honestly (upsert, then
    UPDATE ... RETURNING in the same transaction) so the counter this proof
    checks is the real one, and it takes the Buddhist-era year from
    app.bills._be_year rather than re-deriving +543 anywhere.
    """
    bill_id = uuid.uuid4()
    item_id = uuid.uuid4()
    gross, tare = Decimal("10.500"), Decimal("0.500")
    net = gross - tare                     # NUMERIC is exact; the CHECK enforces this
    unit_price = list_price = Decimal("15.25")
    amount = (net * unit_price).quantize(Decimal("0.01"))   # 10.000 * 15.25 = 152.50, no rounding
    now = datetime.now(tz=timezone.utc)
    be_year = _be_year(now)

    async with tenant_connection(tenant_id) as conn:
        await conn.execute(
            text("INSERT INTO doc_no_counters (tenant_id, be_year, last_seq) VALUES (:t, :y, 0)"
                 " ON CONFLICT (tenant_id, be_year) DO NOTHING"),
            {"t": tenant_id, "y": be_year},
        )
        seq = (
            await conn.execute(
                text("UPDATE doc_no_counters SET last_seq = last_seq + 1"
                     " WHERE tenant_id = :t AND be_year = :y RETURNING last_seq"),
                {"t": tenant_id, "y": be_year},
            )
        ).scalar_one()
        doc_no = f"B-{be_year}-{seq}"
        await conn.execute(
            text("INSERT INTO purchase_bills (id, tenant_id, seller_id, doc_no,"
                 " idempotency_key, total_amount, device_created_at, vehicle_no)"
                 " VALUES (:id, :t, :s, :dn, :k, :tot, :dca, :vn)"),
            {"id": bill_id, "t": tenant_id, "s": SELLER_A_ID, "dn": doc_no,
             "k": f"backup-proof-{note}-{bill_id}", "tot": amount, "dca": now,
             "vn": f"proof-{note}"},
        )
        await conn.execute(
            text("INSERT INTO purchase_bill_items (id, tenant_id, bill_id, product_id, line_no,"
                 " gross_weight, tare_weight, net_weight, unit_price, list_price, amount)"
                 " VALUES (:id, :t, :b, :p, 1, :g, :ta, :n, :up, :lp, :amt)"),
            {"id": item_id, "t": tenant_id, "b": bill_id, "p": PRODUCT_A_ID, "g": gross,
             "ta": tare, "n": net, "up": unit_price, "lp": list_price, "amt": amount},
        )
    return {"bill_id": str(bill_id), "doc_no": doc_no, "be_year": be_year, "seq": int(seq)}


def counter_seq(db: str, tenant_id: uuid.UUID, be_year: int) -> int | None:
    v = scalar(db, "select last_seq::text from public.doc_no_counters where tenant_id ="
                   f" '{tenant_id}' and be_year = {be_year}")
    return int(v) if v is not None else None


def run_script(name: str, argv: list[str]) -> subprocess.CompletedProcess[bytes]:
    """Run one of the operator scripts EXACTLY as an operator would.

    One command per invocation, no chaining and no pipe: on this box a pipeline
    reports the LAST command's status and has manufactured a green before.
    """
    cmd = [sys.executable, str(SERVER_DIR / "scripts" / name), *argv]
    print(f"  $ python scripts/{name} {' '.join(argv)}")
    cp = subprocess.run(cmd, cwd=str(SERVER_DIR), capture_output=True)
    for line in cp.stdout.decode("utf-8", errors="replace").splitlines():
        print(f"    | {line}")
    if cp.returncode != 0:
        for line in cp.stderr.decode("utf-8", errors="replace").splitlines():
            print(f"    ! {line}")
    return cp


# ---------------------------------------------------------------------------
async def main() -> int:
    scratch_engine = None
    try:
        # ------------------------------------------------------------ P0
        print("=== P0: the source, before anything ===")
        live_db = urlparse(APP_DATABASE_URL).path.lstrip("/")
        status = subprocess.run(
            ["docker", "ps", "--filter", f"name=^{CONTAINER}$", "--format", "{{.Status}}"],
            capture_output=True,
        ).stdout.decode("utf-8", errors="replace").strip()
        check("the postgres container is running", bool(status), status or "not running")
        if not status:
            print("\nFAILED: cannot prove anything without a database")
            return 1

        tables = table_names(live_db)
        counts_before = row_counts(live_db, tables)
        print(f"  database {live_db}: {len(tables)} tables,"
              f" {sum(counts_before.values())} rows")

        # A witness bill that already exists — a REAL one written by the bills
        # endpoint in an earlier phase, with whatever rounding history it has.
        witness = scalar(
            live_db,
            "select b.id::text from public.purchase_bills b join public.purchase_bill_items i"
            f" on i.bill_id = b.id where b.tenant_id = '{TENANT_A_ID}'"
            " group by b.id, b.server_received_at order by b.server_received_at desc limit 1",
        )
        if witness is None:
            print("  no existing bill for tenant A; writing one as a pre-dump fixture")
            witness = (await insert_bill(TENANT_A_ID, "witness"))["bill_id"]
            counts_before = row_counts(live_db, tables)
        w_bill = bill_row(live_db, witness)
        w_items = item_rows(live_db, witness)
        check("a witness bill with items exists in the source",
              w_bill is not None and len(w_items) > 0,
              f"{w_bill['doc_no'] if w_bill else None}, {len(w_items)} item(s),"
              f" total {w_bill['total_amount'] if w_bill else None}")

        be_year = _be_year(datetime.now(tz=timezone.utc))
        seq_before = counter_seq(live_db, TENANT_A_ID, be_year)
        print(f"  doc_no counter for tenant A, BE {be_year}: last_seq={seq_before}")
        hex_before = thai_hex(live_db, TENANT_A_ID)
        alembic_before = scalar(live_db, "select version_num from public.alembic_version")

        # ------------------------------------------------------------ P1
        print("\n=== P1: take the backup ===")
        label = f"proof-{uuid.uuid4().hex[:8]}"
        out_root = Path(os.environ.get(
            "RECYCLE_BACKUP_DIR", str(SERVER_DIR.parent.parent / "recycle-online-backups")
        )) / "_proof"
        cp = run_script("backup_db.py", ["--out", str(out_root), "--label", label])
        check("backup_db.py exited 0", cp.returncode == 0, f"exit={cp.returncode}")
        if cp.returncode != 0:
            print("\nFAILED: no dump to restore")
            return 1
        dumps = sorted(p for p in out_root.iterdir() if p.name.endswith(label))
        check("the backup wrote exactly one directory", len(dumps) == 1, str([d.name for d in dumps]))
        if len(dumps) != 1:
            return 1
        dump_dir = dumps[0]
        manifest = json.loads((dump_dir / "MANIFEST.json").read_text(encoding="utf-8"))
        in_dump = manifest["row_counts_in_dump"]

        # The counts in the manifest were parsed out of the dump FILE, so this
        # compares the file against the database rather than the database
        # against itself.
        mismatched = {t: (counts_before.get(t), in_dump.get(t))
                      for t in tables if counts_before.get(t) != in_dump.get(t)}
        check("every table's row count in the DUMP FILE matches the source",
              not mismatched, str(mismatched))
        check("the dump is not schema-only",
              sum(in_dump.values()) > 0, f"{sum(in_dump.values())} rows in the file")
        body = dump_dir / manifest["body_file"]
        check("the dump body carries the witness bill's id",
              witness in body.read_text(encoding="utf-8"), witness)

        # ------------------------------------------------------------ P2
        print("\n=== P2: mutate the source AFTER the dump ===")
        marker = await insert_bill(TENANT_A_ID, "marker")
        seq_after = counter_seq(live_db, TENANT_A_ID, be_year)
        counts_after = row_counts(live_db, tables)
        print(f"  marker bill {marker['doc_no']} ({marker['bill_id']})")
        check("the source's doc_no counter advanced by exactly 1",
              seq_before is None or seq_after == seq_before + 1,
              f"{seq_before} -> {seq_after}")
        check("the source gained one bill and one item",
              counts_after["purchase_bills"] == counts_before["purchase_bills"] + 1
              and counts_after["purchase_bill_items"]
              == counts_before["purchase_bill_items"] + 1,
              f"bills {counts_before['purchase_bills']}->{counts_after['purchase_bills']},"
              f" items {counts_before['purchase_bill_items']}"
              f"->{counts_after['purchase_bill_items']}")
        check("the marker is NOT in the dump file (it was written after the snapshot)",
              marker["bill_id"] not in body.read_text(encoding="utf-8"), marker["bill_id"])

        # ------------------------------------------------------------ P3
        print("\n=== P3: restore into a scratch database ===")
        cp = run_script("restore_db.py", [str(dump_dir), "--into", SCRATCH_DB])
        check("restore_db.py exited 0", cp.returncode == 0, f"exit={cp.returncode}")
        if cp.returncode != 0:
            print("\nFAILED: nothing restored to verify")
            return 1

        # ------------------------------------------------------------ P4
        print("\n=== P4a: the restore reflects the DUMP's moment, not the source's ===")
        counts_restored = row_counts(SCRATCH_DB, table_names(SCRATCH_DB))
        bad = {t: (in_dump.get(t), counts_restored.get(t))
               for t in tables if in_dump.get(t) != counts_restored.get(t)}
        check("restored row counts equal the dump file's, table for table",
              not bad, str(bad))
        check("restored bills are one FEWER than the source right now",
              counts_restored["purchase_bills"] == counts_after["purchase_bills"] - 1,
              f"restored={counts_restored['purchase_bills']},"
              f" source={counts_after['purchase_bills']}")
        check("the marker bill is in the SOURCE",
              bill_row(live_db, marker["bill_id"]) is not None)
        check("the marker bill is ABSENT from the RESTORE (this is the vacuity check)",
              bill_row(SCRATCH_DB, marker["bill_id"]) is None,
              "if this fails the verification is reading the live database")

        seq_restored = counter_seq(SCRATCH_DB, TENANT_A_ID, be_year)
        check("the restored doc_no counter is the dump's value, not the source's",
              seq_restored == seq_before and seq_restored != seq_after,
              f"dump={seq_before}, restored={seq_restored}, source now={seq_after}")

        print("\n=== P4b: the witness bill, digit for digit ===")
        r_bill = bill_row(SCRATCH_DB, witness)
        r_items = item_rows(SCRATCH_DB, witness)
        check("the witness bill exists in the restore", r_bill is not None)
        if r_bill is not None and w_bill is not None:
            diff = {k: (v, r_bill.get(k)) for k, v in w_bill.items() if r_bill.get(k) != v}
            check("every bill header column is identical", not diff, str(diff))
            print(f"    doc_no={w_bill['doc_no']}  total_amount={w_bill['total_amount']}"
                  f"  device_created_at={w_bill['device_created_at']}")
        check("the same number of items came back", len(r_items) == len(w_items),
              f"source={len(w_items)}, restored={len(r_items)}")
        for src, dst in zip(w_items, r_items):
            diff = {k: (v, dst.get(k)) for k, v in src.items() if dst.get(k) != v}
            check(f"item line {src['line_no']}: every weight and money column identical",
                  not diff, str(diff))
            print(f"    gross={src['gross_weight']} tare={src['tare_weight']}"
                  f" net={src['net_weight']} unit={src['unit_price']}"
                  f" list={src['list_price']} amount={src['amount']}")

        print("\n=== P4c: Thai master data, compared as UTF-8 hex ===")
        hex_restored = thai_hex(SCRATCH_DB, TENANT_A_ID)
        check("every seller and product name is byte-identical",
              hex_restored == hex_before,
              f"{len(hex_before)} names; first differing ="
              f" {next((a for a, b in zip(hex_before, hex_restored) if a != b), 'none')}")
        if hex_before:
            print(f"    e.g. {hex_before[0][:80]}")
        check("alembic_version came across",
              scalar(SCRATCH_DB, "select version_num from public.alembic_version")
              == alembic_before, str(alembic_before))

        print("\n=== P4d: the restored copy is still tenant-isolated ===")
        # Restoring as a superuser could produce a database whose rows are all
        # there and whose isolation is gone. Check it the only way that counts:
        # connect as the RUNTIME role and see what it can reach.
        parts = urlparse(APP_DATABASE_URL)
        scratch_engine = create_async_engine(
            urlunparse(parts._replace(path=f"/{SCRATCH_DB}")), pool_pre_ping=True
        )
        async with scratch_engine.connect() as conn:
            async with conn.begin():
                who = (await conn.execute(text("select current_user"))).scalar_one()
                blind = (
                    await conn.execute(text("select count(*) from purchase_bills"))
                ).scalar_one()
            async with conn.begin():
                await conn.execute(
                    text("select set_config('app.tenant_id', :t, true)"),
                    {"t": str(TENANT_A_ID)},
                )
                seen_a = (
                    await conn.execute(text("select count(*) from purchase_bills"))
                ).scalar_one()
                seen_b_rows = (
                    await conn.execute(
                        text("select count(*) from purchase_bills where tenant_id = :b"),
                        {"b": TENANT_B_ID},
                    )
                ).scalar_one()
        # What tenant A SHOULD see, measured in the restored database by the
        # superuser (who is not subject to the policy). Comparing the RLS-scoped
        # count against a hardcoded number would only measure the fixture.
        expect_a = int(scalar(SCRATCH_DB, "select count(*)::text from public.purchase_bills"
                                          f" where tenant_id = '{TENANT_A_ID}'") or "0")
        total_restored = counts_restored["purchase_bills"]
        check("the runtime role can connect to the restored database",
              str(who) == urlparse(APP_DATABASE_URL).username, str(who))
        check("with NO tenant context it sees zero bills (fails closed)", blind == 0,
              f"count={blind}")
        check("with tenant A set it sees exactly tenant A's bills, and no more",
              seen_a == expect_a, f"scoped={seen_a}, tenant A actually has {expect_a}")
        check("that is a real restriction, not 'everything happens to be tenant A'",
              expect_a < total_restored,
              f"tenant A={expect_a} of {total_restored} restored bills")
        check("it cannot see tenant B's bills while scoped to tenant A", seen_b_rows == 0,
              f"count={seen_b_rows}")

        print("")
        print(f"dump directory : {dump_dir}")
        print(f"scratch database: {SCRATCH_DB} (drop it with:"
              f' docker exec {CONTAINER} psql -U postgres -c'
              f' "DROP DATABASE {SCRATCH_DB} WITH (FORCE)")')
        print(f"marker bill left in the source: {marker['doc_no']} — bills are never hard"
              " deleted (hard rule 5), so proof markers accumulate on purpose")
        print("")
        print("ALL BACKUP/RESTORE CASES PASSED" if not failures else f"FAILED: {failures}")
        return 0 if not failures else 1
    finally:
        await engine.dispose()
        if scratch_engine is not None:
            await scratch_engine.dispose()


if __name__ == "__main__":
    code = asyncio.run(main())
    print(f"BACKUP_RESTORE_EXIT={code}")
    sys.exit(code)
