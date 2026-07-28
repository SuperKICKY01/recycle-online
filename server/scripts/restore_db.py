"""Restore a backup_db.py backup into a database, and say what landed.

    # verify a backup by restoring it somewhere harmless (the default)
    python scripts/restore_db.py <backup dir> --into recycle_restore_scratch

    # rebuild the real database on an empty cluster
    python scripts/restore_db.py <backup dir> --into recycle --with-globals

    # overwrite the LIVE database (destructive; the flag is not optional)
    python scripts/restore_db.py <backup dir> --into recycle --overwrite-live

A backup that has never been restored is not a backup, it is a file. The point
of the scratch mode is that verifying costs nothing and destroys nothing, so
there is no excuse for the first restore to be the one during an outage.

HOW IT PROTECTS THE LIVE DATABASE
---------------------------------
* `--into` defaults to a scratch name, never the live one.
* Restoring into the database named in MANIFEST.json requires `--overwrite-live`
  as a separate, explicit flag. Nothing else can reach it.
* The body dump was taken WITHOUT --create precisely so it contains no
  `\\connect`. A dump containing `\\connect recycle` would switch psql to the
  LIVE database mid-file and restore into it no matter what -d said, which is a
  scratch restore that silently overwrites production. This script re-checks
  that the file contains no `\\connect` before running it, every time.
* Checksums from the backup are verified first; a truncated or edited file is
  refused rather than half-applied.
* psql runs with ON_ERROR_STOP=1 AND --single-transaction: a restore either
  completes or leaves an empty database. There is no half-restored state to
  mistake for a good one.

WHAT IT DOES NOT DO
-------------------
* No point-in-time recovery: this restores the dump's instant, nothing finer.
* `--with-globals` is for an EMPTY cluster. pg_dumpall's CREATE ROLE has no
  IF NOT EXISTS, so on a cluster that already has recycle_owner/recycle_app it
  will fail — correctly. Roles are cluster-wide; restoring into scratch on the
  same cluster does not need them.
* It does not restore server/.env / JWT_SECRET; that is not in the database.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

SERVER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_DIR))

DEFAULT_CONTAINER = os.environ.get("RECYCLE_PG_CONTAINER", "recycle_pg")
DEFAULT_SCRATCH = "recycle_restore_scratch"
SUPERUSER = "postgres"


def fail(msg: str) -> NoReturn:
    print(f"\nRESTORE FAILED: {msg}")
    sys.exit(1)


def run(cmd: list[str]) -> subprocess.CompletedProcess[bytes]:
    """No shell, raw bytes. See backup_db.run — cp874 would corrupt Thai text."""
    return subprocess.run(cmd, capture_output=True)


def err_text(cp: subprocess.CompletedProcess[bytes]) -> str:
    return cp.stderr.decode("utf-8", errors="replace").strip()


def docker_exec(container: str, args: list[str]) -> subprocess.CompletedProcess[bytes]:
    return run(["docker", "exec", "-e", "PGCLIENTENCODING=UTF8", container, *args])


def psql(container: str, db: str, sql: str) -> list[list[str]]:
    if "\n" in sql:
        raise ValueError("SQL passed as an argument must be a single line; use a .sql file")
    cp = docker_exec(
        container,
        ["psql", "-U", SUPERUSER, "-d", db, "-Atq", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", sql],
    )
    if cp.returncode != 0:
        fail(f"psql failed ({cp.returncode}): {err_text(cp)}")
    text = cp.stdout.decode("utf-8").replace("\r\n", "\n").strip("\n")
    return [line.split("|") for line in text.split("\n") if line != ""]


def sha256_of(path: Path) -> str:
    import hashlib

    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def psql_file(container: str, db: str, remote_path: str, *, single_txn: bool) -> None:
    cmd = ["psql", "-U", SUPERUSER, "-d", db, "-v", "ON_ERROR_STOP=1", "-q"]
    if single_txn:
        cmd.append("--single-transaction")
    cmd += ["-f", remote_path]
    cp = docker_exec(container, cmd)
    if cp.returncode != 0:
        fail(f"psql -f {remote_path} exited {cp.returncode}:\n{err_text(cp)}")
    warn = err_text(cp)
    if warn:
        # psql -q still writes NOTICEs here; show them, they are not failures.
        for line in warn.splitlines():
            print(f"    psql: {line}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Restore a backup_db.py backup.")
    ap.add_argument("backup_dir", type=Path, help="a directory written by backup_db.py")
    ap.add_argument("--into", default=DEFAULT_SCRATCH,
                    help=f"target database name (default: {DEFAULT_SCRATCH})")
    ap.add_argument("--container", default=DEFAULT_CONTAINER)
    ap.add_argument("--with-globals", action="store_true",
                    help="also apply globals.sql (cluster roles). EMPTY CLUSTER ONLY.")
    ap.add_argument("--overwrite-live", action="store_true",
                    help="permit --into to name the database the backup came from (destructive)")
    args = ap.parse_args()

    started = dt.datetime.now(dt.timezone.utc)
    bdir: Path = args.backup_dir.resolve()
    mpath = bdir / "MANIFEST.json"
    if not mpath.is_file():
        fail(f"{mpath} not found — is {bdir} a backup_db.py directory?")
    manifest = json.loads(mpath.read_text(encoding="utf-8"))

    source_db = manifest["database"]["name"]
    body_name = manifest["body_file"]
    target = args.into

    print("=== the backup ===")
    print(f"  directory      : {bdir}")
    print(f"  taken (UTC)    : {manifest['started_utc']}")
    print(f"  source database: {source_db} on {manifest['server_version'].split(' on ')[0]}")
    print(f"  rows in dump   : {sum(manifest['row_counts_in_dump'].values())}")

    print("\n=== integrity ===")
    for name, meta in sorted(manifest["files"].items()):
        path = bdir / name
        if not path.is_file():
            fail(f"{name} listed in the manifest is missing from the backup")
        actual = sha256_of(path)
        if actual != meta["sha256"]:
            fail(f"{name}: sha256 mismatch — the file changed since the backup was taken\n"
                 f"    manifest {meta['sha256']}\n    on disk  {actual}")
        if path.stat().st_size != meta["bytes"]:
            fail(f"{name}: size mismatch — truncated")
        print(f"  [OK  ] {name} ({meta['bytes']} bytes, sha256 verified)")

    # The dump body must be retargetable. If it ever contains \connect, feeding
    # it to psql would switch database mid-file and a "scratch" restore would
    # write into whatever that line names.
    body = bdir / body_name
    with body.open("r", encoding="utf-8", newline="") as fh:
        bad = [i for i, line in enumerate(fh, 1) if line.startswith("\\connect")]
    if bad:
        fail(f"{body_name} contains \\connect at line(s) {bad[:5]} — it would restore into the"
             " database named there, not into --into. Re-take the backup without --create.")
    print(f"  [OK  ] {body_name} contains no \\connect (safe to retarget)")

    print("\n=== target ===")
    ps = run(["docker", "ps", "--filter", f"name=^{args.container}$", "--format", "{{.Status}}"])
    status = ps.stdout.decode("utf-8", errors="replace").strip()
    if ps.returncode != 0 or not status:
        fail(f"container {args.container!r} is not running")
    print(f"  container      : {args.container} {status}")

    # The gate fires on DATA THAT EXISTS, not on a name. Restoring into the
    # source name on a cluster where it is already there is a destructive
    # overwrite of live money data and needs the flag. Restoring into that same
    # name on an EMPTY cluster is the disaster-recovery path — there is nothing
    # to overwrite, and making an operator type --overwrite-live at 07:00 with a
    # dead disk would be a gate that trains people to pass the flag by reflex.
    target_exists = bool(psql(args.container, "postgres",
                              f"select 1 from pg_database where datname = '{target}'"))
    if target == source_db and target_exists and not args.overwrite_live:
        fail(f"--into {target!r} is the database this backup came FROM and it already exists on"
             f" {args.container}. That is a destructive overwrite of live data. Pass"
             f" --overwrite-live if you mean it, or restore into {DEFAULT_SCRATCH} to verify"
             f" the backup harmlessly.")
    if target == source_db and target_exists:
        print(f"  !! OVERWRITING THE LIVE DATABASE {target!r} (--overwrite-live given)")
    elif target == source_db:
        print(f"  target database: {target} — does not exist on {args.container}; this is a"
              " rebuild from nothing, there is no live copy to overwrite")
    else:
        print(f"  target database: {target} (source was {source_db}; live data untouched)")

    stamp = started.strftime("%Y%m%dT%H%M%SZ")
    tmp = f"/tmp/restore_{stamp}"
    try:
        mk = docker_exec(args.container, ["mkdir", "-p", tmp])
        if mk.returncode != 0:
            fail(f"could not create {tmp} in the container: {err_text(mk)}")

        if args.with_globals:
            print("\n=== cluster roles ===")
            cp = run(["docker", "cp", str(bdir / "globals.sql"),
                      f"{args.container}:{tmp}/globals.sql"])
            if cp.returncode != 0:
                fail(f"docker cp globals.sql failed: {err_text(cp)}")
            # ON_ERROR_STOP is deliberately OFF here, and this is the one place
            # in either script where an exit code is not the verdict.
            # pg_dumpall always emits `CREATE ROLE postgres;`, which fails on any
            # cluster you were able to connect to — you are connected AS postgres.
            # Stopping there would abort disaster recovery on a guaranteed error.
            # The following ALTER ROLE still applies the attributes and password,
            # so instead of trusting the exit code we check the END STATE against
            # the roles the backup recorded. applied != verified.
            cp = docker_exec(args.container, [
                "psql", "-U", SUPERUSER, "-d", "postgres", "-q", "-f", f"{tmp}/globals.sql",
            ])
            for line in err_text(cp).splitlines():
                print(f"    psql: {line}")

            expected_roles = manifest.get("roles", [])
            if not expected_roles:
                fail("this backup records no roles; re-take it with the current backup_db.py")
            actual = {
                r[0]: {"superuser": r[1] == "true", "bypassrls": r[2] == "true",
                       "login": r[3] == "true", "createdb": r[4] == "true",
                       "createrole": r[5] == "true"}
                for r in psql(
                    args.container, "postgres",
                    "select rolname, rolsuper::text, rolbypassrls::text, rolcanlogin::text,"
                    " rolcreatedb::text, rolcreaterole::text from pg_roles"
                    " where rolname not like 'pg\\_%' order by 1",
                )
            }
            wrong = []
            for want in expected_roles:
                name = want["name"]
                got = actual.get(name)
                if got is None:
                    wrong.append(f"{name}: MISSING")
                    continue
                bad_attrs = {k: (v, got[k]) for k, v in want.items()
                             if k != "name" and got.get(k) != v}
                if bad_attrs:
                    wrong.append(f"{name}: {bad_attrs}")
                else:
                    print(f"  [OK  ] role {name}"
                          f" (superuser={want['superuser']}, bypassrls={want['bypassrls']})")
            if wrong:
                # A recycle_app that came back with BYPASSRLS would read every
                # tenant's rows with the policies still nominally in place.
                fail("roles did not come back as recorded — " + "; ".join(wrong))

        print("\n=== create the target database ===")
        db_facts = manifest["database"]
        if db_facts["locale_provider"] != "c":
            fail(f"backup records locale provider {db_facts['locale_provider']!r}; this script"
                 " only recreates libc databases")
        psql(args.container, "postgres", f'DROP DATABASE IF EXISTS "{target}" WITH (FORCE)')
        # Built from MANIFEST.json, not from database.sql, because database.sql
        # hard-codes the SOURCE name. Same facts, one source of truth.
        psql(
            args.container, "postgres",
            f'CREATE DATABASE "{target}" WITH TEMPLATE = template0'
            f" ENCODING = '{db_facts['encoding']}'"
            f" LC_COLLATE = '{db_facts['collate']}' LC_CTYPE = '{db_facts['ctype']}'"
            f' OWNER = "{db_facts["owner"]}"',
        )
        for entry in db_facts["acl"]:
            grantee = "PUBLIC" if entry["grantee"] == "PUBLIC" else f'"{entry["grantee"]}"'
            psql(args.container, "postgres",
                 f'GRANT {entry["privilege"]} ON DATABASE "{target}" TO {grantee}')
        for setting in db_facts.get("settings", []):
            for item in str(setting).split(" "):
                if item:
                    key, _, value = item.partition("=")
                    psql(args.container, "postgres",
                         f"ALTER DATABASE \"{target}\" SET {key} = '{value}'")
        print(f"  created {target} (owner {db_facts['owner']}, {db_facts['encoding']},"
              f" ACL from the backup)")

        print("\n=== restore schema + data ===")
        cp = run(["docker", "cp", str(body), f"{args.container}:{tmp}/{body_name}"])
        if cp.returncode != 0:
            fail(f"docker cp {body_name} failed: {err_text(cp)}")
        psql_file(args.container, target, f"{tmp}/{body_name}", single_txn=True)
        print("  restored (ON_ERROR_STOP + --single-transaction: all or nothing)")
    finally:
        docker_exec(args.container, ["rm", "-rf", tmp])

    # Fresh statistics. pg_dump carries no planner stats, and a restored database
    # without them plans badly until autovacuum gets round to it.
    psql(args.container, target, "ANALYZE")

    print("\n=== what landed ===")
    expected = manifest["row_counts_in_dump"]
    tables = [r[0] for r in psql(
        args.container, target,
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = 'public' and c.relkind = 'r' order by 1",
    )]
    if not tables:
        fail("the restored database has no tables in schema public")
    counts = {
        r[0]: int(r[1])
        for r in psql(
            args.container, target,
            " union all ".join(f"select '{t}', count(*) from public.{t}" for t in tables)
            + " order by 1",
        )
    }
    bad = []
    for t in sorted(set(expected) | set(counts)):
        want = expected.get(t)
        got = counts.get(t)
        ok = want == got
        if not ok:
            bad.append(t)
        print(f"  [{'OK  ' if ok else 'FAIL'}] {t:<24} dump={want}  restored={got}")
    if bad:
        fail(f"row counts differ from the dump for {bad}")

    rls = psql(
        args.container, target,
        "select count(*) filter (where c.relrowsecurity), count(*) filter (where"
        " c.relforcerowsecurity), (select count(*) from pg_policies where schemaname='public')"
        " from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname='public' and c.relkind='r'",
    )[0]
    print(f"  RLS in the restored database: {rls[0]} tables ENABLE, {rls[1]} FORCE,"
          f" {rls[2]} policies")
    if rls[1] == "0" or rls[2] == "0":
        fail("the restored database has no FORCE RLS / no policies — tenant isolation is GONE")

    print(f"\nRESTORE OK: {target} now holds the backup taken at {manifest['started_utc']}")
    if target != source_db:
        print(f"  (the live database {source_db!r} was not touched)")
    return 0


if __name__ == "__main__":
    code = main()
    print(f"RESTORE_EXIT={code}")
    sys.exit(code)
