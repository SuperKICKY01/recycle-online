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
import re
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

SERVER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_DIR))

DEFAULT_CONTAINER = os.environ.get("RECYCLE_PG_CONTAINER", "recycle_pg")
from lane import scratch_name  # noqa: E402  (scratch names are decided in lane.py only)
DEFAULT_SCRATCH = scratch_name("recycle_restore_scratch")
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


# ---------------------------------------------------------------------------
# identifiers — the first identifier-quoting helpers in this repository
# ---------------------------------------------------------------------------
def quote_ident(name: str) -> str:
    """ONE identifier, quoted the way PostgreSQL quotes identifiers.

    Wrap in double quotes, double any embedded double quote. Always quoting is
    correct for every legal identifier, so this does not have to decide whether
    quoting is REQUIRED — pg_catalog's own quote_ident() omits the quotes when
    it can, and that difference is cosmetic in generated SQL.

    WHY IT IS DONE HERE AND NOT BY POSTGRES OR A DRIVER, because this repo had
    no such helper before and the next person will ask. This script has no
    database driver at all: it shells out to `psql -c` through docker exec, so
    asyncpg's parameter binding is not available — and it would not help if it
    were, because a bound parameter is a VALUE and an identifier is not one.
    The server's own quote_ident() is no use either: it returns text, and text
    cannot appear in a FROM clause without dynamic SQL, which would need a DO
    block, which cannot return the counts we came for. So the quoting happens
    on this side, by the documented rule, in exactly one place.

    IT MUST BE APPLIED PER PART, NEVER TO A WHOLE KEY. `"directory.shop_codes"`
    is ONE relation with a dot in its name, looked up through the search path;
    it is not shop_codes in schema directory. Split first (split_key), then
    quote each part.
    """
    return '"' + name.replace('"', '""') + '"'


def quote_literal(text: str) -> str:
    """ONE string literal, escaped the way PostgreSQL escapes them."""
    return "'" + text.replace("'", "''") + "'"


# The privileges `aclexplode` can report for a DATABASE. A privilege word is NOT
# an identifier and MUST NOT be quoted — `GRANT "CONNECT" ON DATABASE` is a
# syntax error, so quote_ident here would break every restore rather than harden
# one. A keyword's defence is a closed set, not an escape function.
DATABASE_PRIVILEGES = frozenset({"CONNECT", "CREATE", "TEMPORARY", "TEMP"})

# A GUC name, and it is not a relation identifier either. Custom settings carry
# exactly one dot (`app.tenant_id`), and that dot is part of the NAME rather than
# a schema separator, so quoting the whole thing as one identifier changes what
# it means and splitting it on the dot is wrong for the opposite reason. Neither
# escape is right, so this validates instead and refuses anything it does not
# recognise — the same reasoning as the privilege set above.
GUC_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$")


def split_key(key: str) -> tuple[str, str]:
    """A manifest row-count key -> (schema, relation).

    backup_db.py's copy_block_counts() strips the literal `public.` prefix off a
    COPY header's table name and NOTHING else, so a BARE key is a relation in
    schema public and a DOTTED key carries its own schema. That asymmetry IS the
    manifest format, and this function is the only place that knows it.

    Split on the FIRST dot: what pg_dump wrote in front of the name is the
    schema. A relation whose own name contains a dot is therefore ambiguous in
    this format — see the CANNOT_SEE entry. Resolving that needs a manifest
    format change, which is deliberately not in this commit.
    """
    schema, dot, relation = key.partition(".")
    if not dot:
        return "public", key
    return schema, relation


def cannot_see(partitioned: int) -> list[str]:
    """The limits of the comparison, printed on EVERY run, green or red.

    Form taken from scripts/reconcile.py: a list of entries, each opening with a
    capitalised lead, printed under its own header as `  - `. One difference,
    and it is deliberate — the second entry carries a number MEASURED on this
    target rather than a claim, because a limit stated as a guess is the thing a
    block like this exists to replace.
    """
    return [
        "WHETHER THE TARGET HOLDS ANYTHING THE DUMP DID NOT CARRY. This walks the"
        " manifest's keys and asks the database about each one, so it answers"
        " whether the dump LANDED COMPLETELY and nothing else. It cannot see an"
        " extra relation, or extra rows in a relation the dump does not name."
        " The previous version enumerated the target's catalogue as a second key"
        " source and could see a public table the dump never mentioned; that is"
        " gone, and nothing else in this script looks for it.",

        "A PARTITIONED TABLE, IF ONE EVER EXISTS. pg_dump emits COPY for a"
        " partition's LEAVES and not for its parent, so the manifest would carry"
        " one key per leaf while the reader is thinking in whole tables — a"
        " different unit, counted silently. MEASURED ON THIS TARGET, NOT"
        f" ASSUMED: {partitioned} relation(s) with relkind='p' outside"
        " pg_catalog and information_schema. At zero this is a statement about"
        " the future, and the number is re-measured every run so it cannot"
        " quietly stop being zero.",

        "A RELATION WHOSE OWN NAME CONTAINS A DOT. The manifest key space is"
        " hybrid — bare for public, schema-qualified for everything else — so"
        " `a.b` is read as relation b in schema a, and a public relation"
        " genuinely named `a.b` would be looked for in the wrong schema. No"
        " manifest in the backup root carries such a key today. Fixing it needs"
        " a manifest FORMAT change, deliberately not in this commit.",
    ]


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
    # A LITERAL here, not an identifier: it is compared against datname, it is
    # not naming an object. --into comes from the command line, so it is the one
    # value in this file an outsider chooses.
    target_exists = bool(psql(args.container, "postgres",
                              "select 1 from pg_database where datname ="
                              f" {quote_literal(target)}"))
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
        # THE MOST EXPOSED STATEMENT IN THIS FILE, and it was the least protected:
        # a hand-written pair of double quotes around a value the caller supplies
        # on the command line escapes nothing, so a --into carrying a double
        # quote closed the quoting and the rest of the argument became SQL — in a
        # DROP DATABASE.
        psql(args.container, "postgres",
             f"DROP DATABASE IF EXISTS {quote_ident(target)} WITH (FORCE)")
        # Built from MANIFEST.json, not from database.sql, because database.sql
        # hard-codes the SOURCE name. Same facts, one source of truth.
        #
        # THREE KINDS OF VALUE IN ONE STATEMENT, and they do not take the same
        # treatment: the database and its OWNER are identifiers; the encoding and
        # the two locales are string literals.
        psql(
            args.container, "postgres",
            f"CREATE DATABASE {quote_ident(target)} WITH TEMPLATE = template0"
            f" ENCODING = {quote_literal(db_facts['encoding'])}"
            f" LC_COLLATE = {quote_literal(db_facts['collate'])}"
            f" LC_CTYPE = {quote_literal(db_facts['ctype'])}"
            f" OWNER = {quote_ident(db_facts['owner'])}",
        )
        for entry in db_facts["acl"]:
            # The PRIVILEGE is a keyword and is deliberately NOT quoted; it is
            # checked against the closed set Postgres can report for a database
            # instead. PUBLIC is a keyword too, which is why it keeps its
            # existing exception rather than being quoted into a role named
            # "PUBLIC" — a different grantee entirely.
            privilege = str(entry["privilege"]).upper()
            if privilege not in DATABASE_PRIVILEGES:
                fail(f"manifest ACL names privilege {entry['privilege']!r}, which is not one"
                     f" Postgres reports for a database ({sorted(DATABASE_PRIVILEGES)});"
                     " refusing to build a GRANT from it")
            grantee = ("PUBLIC" if entry["grantee"] == "PUBLIC"
                       else quote_ident(entry["grantee"]))
            psql(args.container, "postgres",
                 f"GRANT {privilege} ON DATABASE {quote_ident(target)} TO {grantee}")
        for setting in db_facts.get("settings", []):
            for item in str(setting).split(" "):
                if item:
                    key, _, value = item.partition("=")
                    if not GUC_KEY.match(key):
                        fail(f"manifest records a database setting whose name is {key!r},"
                             " which is not a shape this script will build SQL from"
                             " (letters, digits and underscores, with at most one dot)")
                    psql(args.container, "postgres",
                         f"ALTER DATABASE {quote_ident(target)} SET {key} ="
                         f" {quote_literal(value)}")
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
    # ONE KEY SET, AND IT IS THE MANIFEST'S. The catalogue used to supply a
    # second set of keys and the two were compared over their UNION, so a key
    # present on one side and absent on the other landed in `bad` and failed a
    # restore in which every row had arrived. The first relation outside schema
    # public — directory.shop_codes, migration 0009 — made that fire on the
    # first backup taken after the migration, with the table still empty.
    # Walking the dump's own keys removes the union: nothing can be compared
    # that the dump did not name.
    expected = manifest["row_counts_in_dump"]
    if not expected:
        fail("this backup's manifest records no row counts at all; re-take it with"
             " the current backup_db.py")

    keys = sorted(expected)
    targets = {k: split_key(k) for k in keys}

    # PRESENCE FIRST, and to_regclass rather than a count, because to_regclass
    # returns NULL for an absent relation where `count(*)` raises. Counting
    # blind would abort psql and kill the run with a driver error instead of
    # naming the relation that did not arrive.
    # `== "true"`, NOT `== "t"`. `boolean::text` renders 'true'/'false'; psql
    # only shows t/f for an UNCAST boolean. backup_db.py carries the same note
    # at its superuser check, where comparing against 't' "silently failed every
    # check once" — and it failed every check here too, on the first run of this
    # code: all 13 keys reported MISSING against a database that held them all.
    present = {
        r[0]: r[1] == "true"
        for r in psql(
            args.container, target,
            " union all ".join(
                f"select {quote_literal(k)},"
                f" (to_regclass({quote_literal(quote_ident(s) + '.' + quote_ident(rel))})"
                " is not null)::text"
                for k, (s, rel) in targets.items()
            ),
        )
    }

    countable = [k for k in keys if present.get(k)]
    counts: dict[str, int] = {}
    if countable:
        counts = {
            r[0]: int(r[1])
            for r in psql(
                args.container, target,
                " union all ".join(
                    f"select {quote_literal(k)}, count(*) from"
                    f" {quote_ident(targets[k][0])}.{quote_ident(targets[k][1])}"
                    for k in countable
                ),
            )
        }

    missing, differing = [], []
    for k in keys:
        want = expected[k]
        if not present.get(k):
            missing.append(k)
            print(f"  [FAIL] {k:<24} dump={want}  restored=MISSING")
            continue
        got = counts.get(k)
        ok = want == got
        if not ok:
            differing.append(k)
        print(f"  [{'OK  ' if ok else 'FAIL'}] {k:<24} dump={want}  restored={got}")

    # Printed BEFORE the verdict so it appears on a red run too. fail() exits
    # immediately, so a limits block written after it would only ever be read by
    # someone whose restore had already succeeded — which is the reader who
    # needs it least.
    partitioned = int(psql(
        args.container, target,
        "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where c.relkind = 'p' and n.nspname not in ('pg_catalog','information_schema')",
    )[0][0])
    print("\n=== what this comparison CANNOT see ===")
    for line in cannot_see(partitioned):
        print(f"  - {line}")

    # TWO DIFFERENT EVENTS, NAMED DIFFERENTLY. "row counts differ" was printed
    # for both before this change, and for the absent-key case it was false:
    # no count differed, a key was absent on one side. An operator at 07:00 gets
    # the distinction in the sentence now, not only in the table above it.
    problems = []
    if missing:
        problems.append(f"{len(missing)} relation(s) named by the dump are ABSENT from"
                        f" the restored database: {missing}")
    if differing:
        problems.append(f"row counts differ from the dump for {differing}")
    if problems:
        fail("; ".join(problems))

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
