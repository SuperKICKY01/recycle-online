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
    P4  restored == the dump's moment, and != the source's (below)
    --  cleanup: the marker is VOIDED once P4 has compared, so each run leaves
        the fixture with nothing live added. It is voided rather than deleted:
        a delete would gap the doc_no sequence while doc_no_counters kept
        counting, and the dev data would then contradict the invariant that
        counter exists to provide.

    P4 in detail:
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

The proof leaves its own dump directories and the two scratch databases in
place as evidence; all are safe to delete (the last lines say how).

RETIRED COST (2026-08-29, M4 c2): this proof used to write one permanent voided
marker bill to the LIVE dev database per run and spend a live doc_no that hard
rule 5 could never reissue. It no longer does — the live database is READ
(dumped) and never written; the marker and the counter bump land in a scratch
restored from that dump, and the end cell proves the live write count is zero.
(lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md)
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import uuid
from contextlib import asynccontextmanager
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
from app.seeddata import PRODUCT_A_ID, SELLER_A_ID, TENANT_A_ID, TENANT_B_ID  # noqa: E402

CONTAINER = os.environ.get("RECYCLE_PG_CONTAINER", "recycle_pg")
# Two scratches, fixed names so restore_db.py OVERWRITES them each run (twice-bare,
# no accumulation). SOURCE is the only database this proof ever mutates; the live
# database is only dumped.
from lane import scratch_name  # noqa: E402  (scratch names are decided in lane.py only)
SCRATCH_SOURCE = scratch_name("recycle_restore_source")
SCRATCH_TARGET = scratch_name("recycle_restore_target")
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


@asynccontextmanager
async def _tenant_txn(target_engine, tenant_id: uuid.UUID):
    """A tenant-scoped transaction on ANY engine — the SET LOCAL app.tenant_id
    shape of app.db.tenant_connection, but bindable to a scratch database so the
    marker write lands there and NEVER on live."""
    async with target_engine.connect() as conn:
        async with conn.begin():
            await conn.execute(
                text("SELECT set_config('app.tenant_id', :t, true)"),
                {"t": str(tenant_id)},
            )
            yield conn


# ---------------------------------------------------------------------------
# fixture: write a bill through the app role, under tenant context
# ---------------------------------------------------------------------------
async def insert_bill(target_engine, tenant_id: uuid.UUID, note: str) -> dict:
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

    async with _tenant_txn(target_engine, tenant_id) as conn:
        # The counter is keyed per BRANCH since migration 0018, and the bill
        # carries its branch NOT NULL. This fixture writes into the tenant's
        # born-with branch (code MAIN, prefix B) and takes the prefix FROM THE
        # ROW rather than restating 'B', so the marker's doc_no is what the
        # real path would have minted for that branch.
        branch = (
            await conn.execute(
                text("SELECT id, doc_prefix FROM branches WHERE code = 'MAIN'")
            )
        ).mappings().one()
        await conn.execute(
            text("INSERT INTO doc_no_counters (tenant_id, branch_id, be_year, last_seq)"
                 " VALUES (:t, :b, :y, 0)"
                 " ON CONFLICT (tenant_id, branch_id, be_year) DO NOTHING"),
            {"t": tenant_id, "b": branch["id"], "y": be_year},
        )
        seq = (
            await conn.execute(
                text("UPDATE doc_no_counters SET last_seq = last_seq + 1"
                     " WHERE tenant_id = :t AND branch_id = :b AND be_year = :y"
                     " RETURNING last_seq"),
                {"t": tenant_id, "b": branch["id"], "y": be_year},
            )
        ).scalar_one()
        doc_no = f"{branch['doc_prefix']}-{be_year}-{seq}"
        await conn.execute(
            text("INSERT INTO purchase_bills (id, tenant_id, seller_id, doc_no,"
                 " idempotency_key, total_amount, device_created_at, vehicle_no,"
                 " branch_id)"
                 " VALUES (:id, :t, :s, :dn, :k, :tot, :dca, :vn, :br)"),
            {"id": bill_id, "t": tenant_id, "s": SELLER_A_ID, "dn": doc_no,
             "k": f"backup-proof-{note}-{bill_id}", "tot": amount, "dca": now,
             "vn": f"proof-{note}", "br": branch["id"]},
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


def _one_dump(out_root: Path, label: str) -> Path | None:
    """The single dump directory whose name ends with `label`, or None if the
    backup wrote zero or more than one (either is a failure this proof reports)."""
    dumps = sorted(p for p in out_root.iterdir() if p.name.endswith(label))
    return dumps[0] if len(dumps) == 1 else None


# ---------------------------------------------------------------------------
async def main() -> int:
    live_db = urlparse(APP_DATABASE_URL).path.lstrip("/")
    source_url = urlunparse(urlparse(APP_DATABASE_URL)._replace(path=f"/{SCRATCH_SOURCE}"))
    source_engine = create_async_engine(source_url, pool_pre_ping=True)
    target_engine = None
    try:
        # ------------------------------------------------------------ P0
        # LIVE, read-only. Capture the two figures the end cell must find
        # UNCHANGED — the whole point of this refactor is that they do not move.
        print("=== P0: the LIVE source, before anything (READ-ONLY) ===")
        status = subprocess.run(
            ["docker", "ps", "--filter", f"name=^{CONTAINER}$", "--format", "{{.Status}}"],
            capture_output=True,
        ).stdout.decode("utf-8", errors="replace").strip()
        check("the postgres container is running", bool(status), status or "not running")
        if not status:
            print("\nFAILED: cannot prove anything without a database")
            return 1

        tables = table_names(live_db)
        counts_live = row_counts(live_db, tables)
        print(f"  live database {live_db}: {len(tables)} tables, {sum(counts_live.values())} rows")

        be_year = _be_year(datetime.now(tz=timezone.utc))
        # THE REFACTOR'S OWN PROOF, captured HERE before anything runs: these two
        # live figures must be byte-identical at the end.
        live_bills_p0 = int(scalar(
            live_db, "select count(*)::text from public.purchase_bills") or "0")
        live_counter_p0 = counter_seq(live_db, TENANT_A_ID, be_year)
        print(f"  live purchase_bills={live_bills_p0}; tenant A doc_no counter BE"
              f" {be_year}: {live_counter_p0}")

        # A witness bill that already exists — a REAL one, with whatever rounding
        # history it has. Live is never written now, so if there is none this
        # read-only proof cannot run (dev has bills — this is a guard).
        witness = scalar(
            live_db,
            "select b.id::text from public.purchase_bills b join public.purchase_bill_items i"
            f" on i.bill_id = b.id where b.tenant_id = '{TENANT_A_ID}'"
            " group by b.id, b.server_received_at order by b.server_received_at desc limit 1",
        )
        if witness is None:
            print("\nFAILED: no pre-existing bill for tenant A, and live is READ-ONLY now")
            return 1
        w_bill = bill_row(live_db, witness)
        w_items = item_rows(live_db, witness)
        check("a witness bill with items exists in the live source",
              w_bill is not None and len(w_items) > 0,
              f"{w_bill['doc_no'] if w_bill else None}, {len(w_items)} item(s),"
              f" total {w_bill['total_amount'] if w_bill else None}")
        hex_before = thai_hex(live_db, TENANT_A_ID)
        alembic_before = scalar(live_db, "select version_num from public.alembic_version")

        out_root = Path(os.environ.get(
            "RECYCLE_BACKUP_DIR", str(SERVER_DIR.parent.parent / "recycle-online-backups")
        )) / "_proof"

        # ------------------------------------------------------------ P1
        # The ONLY live interaction: a READ-ONLY dump. The manifest-vs-live
        # row-count comparison (so the FORCE-RLS zero-row trap the dump tooling
        # guards) is exercised HERE, on the live database.
        print("\n=== P1: dump the LIVE database (read-only) ===")
        label = f"proof-{uuid.uuid4().hex[:8]}"
        cp = run_script("backup_db.py",
                        ["--db", live_db, "--out", str(out_root), "--label", f"{label}-live"])
        check("backup_db.py (live) exited 0", cp.returncode == 0, f"exit={cp.returncode}")
        if cp.returncode != 0:
            print("\nFAILED: no live dump to restore")
            return 1
        dump_live = _one_dump(out_root, f"{label}-live")
        check("the live backup wrote exactly one directory", dump_live is not None, str(out_root))
        if dump_live is None:
            return 1
        manifest_live = json.loads((dump_live / "MANIFEST.json").read_text(encoding="utf-8"))
        in_dump_live = manifest_live["row_counts_in_dump"]
        mismatched = {t: (counts_live.get(t), in_dump_live.get(t))
                      for t in tables if counts_live.get(t) != in_dump_live.get(t)}
        check("every table's row count in the LIVE DUMP FILE matches live",
              not mismatched, str(mismatched))
        check("the live dump is not schema-only",
              sum(in_dump_live.values()) > 0, f"{sum(in_dump_live.values())} rows in the file")
        check("the live dump body carries the witness bill's id",
              witness in (dump_live / manifest_live["body_file"]).read_text(encoding="utf-8"),
              witness)

        # ------------------------------------------------------------ P1b
        print("\n=== P1b: restore the live dump into scratch-SOURCE ===")
        cp = run_script("restore_db.py", [str(dump_live), "--into", SCRATCH_SOURCE])
        check("restore_db.py (-> scratch-SOURCE) exited 0",
              cp.returncode == 0, f"exit={cp.returncode}")
        if cp.returncode != 0:
            print("\nFAILED: no scratch-SOURCE to mutate")
            return 1
        source_tables = table_names(SCRATCH_SOURCE)
        counts_source_before = row_counts(SCRATCH_SOURCE, source_tables)
        seq_source_before = counter_seq(SCRATCH_SOURCE, TENANT_A_ID, be_year)

        # ------------------------------------------------------------ P1c
        # LOAD-BEARING: dump scratch-SOURCE BEFORE the marker. This dump becomes
        # scratch-TARGET; the vacuity guard lives on its being taken pre-marker.
        # A dump taken AFTER would carry the marker into TARGET and the "absent
        # from the restore" check would be vacuous.
        print("\n=== P1c: dump scratch-SOURCE BEFORE the marker (the vacuity anchor) ===")
        cp = run_script("backup_db.py",
                        ["--db", SCRATCH_SOURCE, "--out", str(out_root), "--label", f"{label}-source"])
        check("backup_db.py (scratch-SOURCE, pre-marker) exited 0",
              cp.returncode == 0, f"exit={cp.returncode}")
        if cp.returncode != 0:
            return 1
        dump_source = _one_dump(out_root, f"{label}-source")
        check("the pre-marker source backup wrote exactly one directory",
              dump_source is not None, str(out_root))
        if dump_source is None:
            return 1
        manifest_source = json.loads((dump_source / "MANIFEST.json").read_text(encoding="utf-8"))
        in_dump_source = manifest_source["row_counts_in_dump"]
        source_body = dump_source / manifest_source["body_file"]

        # ------------------------------------------------------------ P2
        # The mutation lands in scratch-SOURCE, via a SOURCE-bound engine. Live
        # is never touched.
        print("\n=== P2: mutate scratch-SOURCE AFTER its dump ===")
        marker = await insert_bill(source_engine, TENANT_A_ID, "marker")
        seq_source_after = counter_seq(SCRATCH_SOURCE, TENANT_A_ID, be_year)
        counts_source_after = row_counts(SCRATCH_SOURCE, source_tables)
        print(f"  marker bill {marker['doc_no']} ({marker['bill_id']}) written to {SCRATCH_SOURCE}")
        check("scratch-SOURCE's doc_no counter advanced by exactly 1",
              seq_source_before is None or seq_source_after == seq_source_before + 1,
              f"{seq_source_before} -> {seq_source_after}")
        check("scratch-SOURCE gained one bill and one item",
              counts_source_after["purchase_bills"] == counts_source_before["purchase_bills"] + 1
              and counts_source_after["purchase_bill_items"]
              == counts_source_before["purchase_bill_items"] + 1,
              f"bills {counts_source_before['purchase_bills']}->{counts_source_after['purchase_bills']},"
              f" items {counts_source_before['purchase_bill_items']}"
              f"->{counts_source_after['purchase_bill_items']}")
        check("the marker is NOT in the pre-marker source dump (written after the snapshot)",
              marker["bill_id"] not in source_body.read_text(encoding="utf-8"), marker["bill_id"])

        # ------------------------------------------------------------ P3
        print("\n=== P3: restore the pre-marker source dump into scratch-TARGET ===")
        cp = run_script("restore_db.py", [str(dump_source), "--into", SCRATCH_TARGET])
        check("restore_db.py (-> scratch-TARGET) exited 0",
              cp.returncode == 0, f"exit={cp.returncode}")
        if cp.returncode != 0:
            print("\nFAILED: nothing restored to verify")
            return 1

        # ------------------------------------------------------------ P4a
        # THE VACUITY PAIR, in one run: the marker is PRESENT in post-marker
        # scratch-SOURCE and ABSENT in scratch-TARGET; the counter is +1 in
        # SOURCE and the pre-marker value in TARGET.
        print("\n=== P4a: the vacuity PAIR — marker PRESENT in SOURCE, ABSENT in TARGET ===")
        counts_target = row_counts(SCRATCH_TARGET, table_names(SCRATCH_TARGET))
        bad = {t: (in_dump_source.get(t), counts_target.get(t))
               for t in source_tables if in_dump_source.get(t) != counts_target.get(t)}
        check("restored TARGET row counts equal the pre-marker source dump's, table for table",
              not bad, str(bad))
        check("TARGET has one FEWER bill than post-marker SOURCE",
              counts_target["purchase_bills"] == counts_source_after["purchase_bills"] - 1,
              f"target={counts_target['purchase_bills']},"
              f" source={counts_source_after['purchase_bills']}")
        check("the marker bill is PRESENT in post-marker scratch-SOURCE",
              bill_row(SCRATCH_SOURCE, marker["bill_id"]) is not None)
        check("the marker bill is ABSENT from scratch-TARGET (the vacuity check)",
              bill_row(SCRATCH_TARGET, marker["bill_id"]) is None,
              "if this fails the restore captured a post-dump mutation")
        seq_target = counter_seq(SCRATCH_TARGET, TENANT_A_ID, be_year)
        check("TARGET's counter is the pre-marker value, SOURCE's is +1",
              seq_target == seq_source_before and seq_source_after != seq_source_before,
              f"pre={seq_source_before}, target={seq_target}, source now={seq_source_after}")

        print("\n=== P4b: the witness bill, digit for digit (in scratch-TARGET) ===")
        r_bill = bill_row(SCRATCH_TARGET, witness)
        r_items = item_rows(SCRATCH_TARGET, witness)
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
        hex_restored = thai_hex(SCRATCH_TARGET, TENANT_A_ID)
        check("every seller and product name is byte-identical",
              hex_restored == hex_before,
              f"{len(hex_before)} names; first differing ="
              f" {next((a for a, b in zip(hex_before, hex_restored) if a != b), 'none')}")
        if hex_before:
            print(f"    e.g. {hex_before[0][:80]}")
        check("alembic_version came across",
              scalar(SCRATCH_TARGET, "select version_num from public.alembic_version")
              == alembic_before, str(alembic_before))

        print("\n=== P4d: the restored copy is still tenant-isolated ===")
        # Restoring as a superuser could produce a database whose rows are all
        # there and whose isolation is gone. Check it the only way that counts:
        # connect as the RUNTIME role and see what it can reach.
        parts = urlparse(APP_DATABASE_URL)
        target_engine = create_async_engine(
            urlunparse(parts._replace(path=f"/{SCRATCH_TARGET}")), pool_pre_ping=True
        )
        async with target_engine.connect() as conn:
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
        expect_a = int(scalar(SCRATCH_TARGET, "select count(*)::text from public.purchase_bills"
                                              f" where tenant_id = '{TENANT_A_ID}'") or "0")
        total_restored = counts_target["purchase_bills"]
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

        # ------------------------------------------------------------ end
        # THE REFACTOR'S OWN PROOF: the live database was READ and never written.
        # Both figures compared against what P0 captured before anything ran.
        print("\n=== end: the LIVE database was READ and never written ===")
        live_bills_end = int(scalar(
            live_db, "select count(*)::text from public.purchase_bills") or "0")
        live_counter_end = counter_seq(live_db, TENANT_A_ID, be_year)
        check("live purchase_bills count is identical to P0 — ZERO live writes",
              live_bills_end == live_bills_p0, f"{live_bills_p0} -> {live_bills_end}")
        check("the live doc_no counter is identical to P0 — no doc_no spent",
              live_counter_end == live_counter_p0, f"{live_counter_p0} -> {live_counter_end}")

        print("")
        print(f"dumps: {dump_live}  and  {dump_source}")
        print(f"scratch databases: {SCRATCH_SOURCE} (mutated), {SCRATCH_TARGET} (restore target);"
              f' drop with: docker exec {CONTAINER} psql -U postgres -c'
              f' "DROP DATABASE <name> WITH (FORCE)"')
        print(f"marker bill {marker['doc_no']} lives in {SCRATCH_SOURCE} ONLY — dev is untouched")
        print("")
        print("ALL BACKUP/RESTORE CASES PASSED" if not failures else f"FAILED: {failures}")
        return 0 if not failures else 1
    finally:
        await source_engine.dispose()
        if target_engine is not None:
            await target_engine.dispose()


if __name__ == "__main__":
    code = asyncio.run(main())
    print(f"BACKUP_RESTORE_EXIT={code}")
    sys.exit(code)
