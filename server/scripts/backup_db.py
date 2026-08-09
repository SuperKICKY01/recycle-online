"""Dump the money database to plain files on the host, OUTSIDE the docker volume.

    python scripts/backup_db.py                    (from the server/ directory)
    python scripts/backup_db.py --out D:\\recycle-backups

Every integrity guarantee in this repo — NUMERIC money, FORCE RLS, the gap-free
doc_no counter, void-instead-of-delete — protects rows that live in exactly ONE
place: the docker named volume `recycle_pgdata`. `docker compose down -v` erases
it, and so does a dead disk. This script makes a second copy that a dead disk
cannot take with it.

Scope: the local docker-compose Postgres (`recycle_pg`), which is the only
deployment that exists today. There is no cloud host to back up yet.


WHY pg_dump RUNS INSIDE THE CONTAINER
-------------------------------------
* Version pairing. pg_dump refuses to dump a server newer than itself. The
  container's own pg_dump is by construction the same build as the server
  (16.14 here), so the pair can never drift. A host-installed pg_dump can.
* RLS. Every business table is ENABLE + FORCE ROW LEVEL SECURITY, and the
  policy reads `app.tenant_id`, which a backup never sets. That is the whole
  point of the security model and it is also the way a backup can silently
  capture NOTHING. Dumping as recycle_owner or recycle_app does not silently
  produce an empty file — pg_dump fails loudly (observed on this box,
  2026-07-28):

      pg_dump: error: query failed: ERROR:  query would be affected by
      row-level security policy for table "sellers"

  We dump as `postgres`, the container superuser: the only role here that can
  see every tenant's rows. DO NOT "fix" a future RLS error by adding
  `--enable-row-security`. That flag makes the dump SUCCEED with whatever rows
  the policy admits, and for an unset tenant context that is zero rows. A
  green run producing a schema-shaped empty backup is the exact failure this
  file exists to prevent — which is why step V below hard-fails when a table
  has rows in the database and no rows in the dump.


WHAT IT WRITES  (plain text, one timestamped directory per run)
---------------------------------------------------------------
    recycle_<UTC>/
        globals.sql       pg_dumpall --globals-only: the CLUSTER roles
                          (recycle_owner / recycle_app / postgres), their
                          NOSUPERUSER + NOBYPASSRLS attributes and their
                          password hashes. db/init/00_init_roles.sql only ever
                          runs on a fresh volume and carries DEV passwords, so
                          it is not a substitute for this file.
        database.sql      database-level objects: CREATE DATABASE with the
                          exact owner/encoding/locale, and the database ACL
                          (GRANT CONNECT ... TO recycle_app). pg_dump only
                          emits these under --create, and --create hard-codes
                          the database NAME plus a `\\connect` — which would
                          make a "restore into scratch" silently write into
                          the LIVE database. So the body dump below is taken
                          WITHOUT --create and this file is generated from the
                          catalog instead.
        recycle.sql       pg_dump, plain: schema, ALL data, ownership, table
                          and schema grants, default privileges, and the RLS
                          policies + ENABLE/FORCE flags. No CREATE DATABASE,
                          no `\\connect` — it restores into whichever database
                          psql is pointed at.
        MANIFEST.json     machine-readable facts the restore needs (database
                          owner/encoding/locale) plus the evidence below.
        MANIFEST.txt      the same for a human, including what is NOT captured.
        checksums.sha256  so a restore can refuse a truncated or edited file.


WHAT THIS DOES *NOT* CAPTURE  (restated in MANIFEST.txt every run)
------------------------------------------------------------------
* Anything written after the snapshot. pg_dump reads one repeatable-read
  snapshot taken when it starts, so the file is internally consistent — and
  frozen at that instant. There is no WAL archiving and no point-in-time
  recovery here: every bill taken between two backups is lost if the disk dies.
* `server/.env`, and therefore JWT_SECRET. It is not in the database. A
  restore onto a box with a different secret restores every bill correctly and
  invalidates every issued token (staff sign in again). Back it up separately;
  it is a credential, not data.
* Bills that are still only on a phone. The mobile app is offline-first: a
  pending bill lives in the device's SQLite and has never reached Postgres, so
  no server backup can contain it. It is not lost — it syncs when the phone
  next reaches a server.
* Application code, migrations, `db/init`. Those are in git.
* Any other database in the cluster. Only the app database is dumped.
* Encryption, off-site copies, scheduling and retention — deliberately out of
  scope (see the note at the end of this docstring).

DELIBERATELY NOT BUILT: scheduling, cloud/off-site upload, retention/pruning,
encryption at rest. This is two scripts and a proven round trip. The directory
this writes to holds unencrypted money data AND cluster password hashes; treat
it exactly like the database itself.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import NoReturn
from urllib.parse import urlparse

SERVER_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = SERVER_DIR.parent
sys.path.insert(0, str(SERVER_DIR))

from dotenv import load_dotenv  # noqa: E402

# Resolve .env from THIS file, never the cwd: load_dotenv() walks up from the
# calling file (lessons/config-defaults-must-fail-closed.md).
load_dotenv(SERVER_DIR / ".env")

DEFAULT_CONTAINER = os.environ.get("RECYCLE_PG_CONTAINER", "recycle_pg")
DEFAULT_OUT = Path(
    os.environ.get("RECYCLE_BACKUP_DIR", str(REPO_DIR.parent / "recycle-online-backups"))
)

# The superuser inside the container. See the RLS note above — this is not a
# convenience, it is the only role that can see every tenant.
SUPERUSER = "postgres"


# ---------------------------------------------------------------------------
# process helpers
# ---------------------------------------------------------------------------
def fail(msg: str) -> NoReturn:
    print(f"\nBACKUP FAILED: {msg}")
    sys.exit(1)


def run(cmd: list[str]) -> subprocess.CompletedProcess[bytes]:
    """Run a command with NO shell and capture raw bytes.

    Bytes, never text=True: this box's locale encoding is cp874 (CLAUDE.md),
    so letting Python decode with the default would turn correct Thai product
    names into mojibake and invite someone to "fix" the data.
    """
    return subprocess.run(cmd, capture_output=True)


def err_text(cp: subprocess.CompletedProcess[bytes]) -> str:
    return cp.stderr.decode("utf-8", errors="replace").strip()


def docker_exec(container: str, args: list[str]) -> subprocess.CompletedProcess[bytes]:
    # No -t. A TTY would turn every LF into CRLF and corrupt anything we read.
    return run(["docker", "exec", "-e", "PGCLIENTENCODING=UTF8", container, *args])


def psql(container: str, db: str, sql: str) -> list[list[str]]:
    """Run ONE-LINE sql and return rows split on '|'.

    The one-line rule is not style. Multi-line text passed as a shell argument
    is mangled on this box by at least one mechanism, and which one differs by
    command (CLAUDE.md). Long SQL goes in a file, not in an argument.
    """
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
# identifiers
# ---------------------------------------------------------------------------
# THESE ARE A SECOND COPY. restore_db.py defines the same two functions, and the
# duplication is deliberate rather than lazy.
#
# lessons/a-checker-must-not-share-the-code-it-checks.md, Bound 1, gives the
# test: could a second author, given only the SPEC, reach the same answer? For
# PostgreSQL identifier quoting the answer is yes — the rule is published and
# `quote_ident()` is its authority, so two authors write the identical function.
# That makes it ARITHMETIC, which that bound says to duplicate. A CONVENTION is
# the opposite case and must be imported: restore_db.py's `split_key` encodes
# THIS repository's manifest key-space choice, has no authority outside this
# tree, and is deliberately NOT copied here.
#
# The alternative — a shared module — would have meant editing restore_db.py to
# import what it currently defines, and that file is a separate concern from
# this one; a second edit to it belongs in its own change. It would also make
# this the second cross-script import in server/scripts, where the only existing
# one (prove_reconcile.py importing reconcile.rolconfig_setting) carries a
# docstring arguing at length that it is an exception.
def quote_ident(name: str) -> str:
    """ONE identifier, quoted the way PostgreSQL quotes identifiers.

    Wrap in double quotes, double any embedded double quote. Always quoting is
    correct for every legal identifier, so this does not have to decide whether
    quoting is REQUIRED.

    WHAT IT PREVENTS HERE IS NOT A SYNTAX ERROR. Unquoted, `from public.Odd Name`
    is VALID SQL — it reads as relation `public.Odd` with alias `Name`. Measured
    on this box: it failed only because no relation `odd` existed. Had one
    existed, the count would have come back from the WRONG TABLE and looked
    entirely plausible in the manifest.
    """
    return '"' + name.replace('"', '""') + '"'


def quote_literal(text: str) -> str:
    """ONE string literal, escaped the way PostgreSQL escapes them."""
    return "'" + text.replace("'", "''") + "'"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# catalog facts
# ---------------------------------------------------------------------------
def db_name_from_env(default: str = "recycle") -> str:
    url = os.environ.get("APP_DATABASE_URL", "")
    if not url:
        return default
    return urlparse(url).path.lstrip("/") or default


def cluster_roles(container: str, db: str) -> list[dict[str, object]]:
    """Non-system roles and the attributes that matter, recorded for the restore.

    globals.sql carries these, but a restore cannot simply trust that it applied:
    pg_dumpall emits `CREATE ROLE postgres;` which fails on any cluster you are
    able to connect to. So the restore runs globals tolerantly and then checks
    the END STATE against this list. The attribute that matters most is
    rolbypassrls — a restored recycle_app with BYPASSRLS would hold every
    tenant's rows with the policies still nominally in place.
    """
    rows = psql(
        container,
        db,
        "select rolname, rolsuper::text, rolbypassrls::text, rolcanlogin::text,"
        " rolcreatedb::text, rolcreaterole::text from pg_roles"
        " where rolname not like 'pg\\_%' order by 1",
    )
    return [
        {"name": r[0], "superuser": r[1] == "true", "bypassrls": r[2] == "true",
         "login": r[3] == "true", "createdb": r[4] == "true", "createrole": r[5] == "true"}
        for r in rows
    ]


def public_tables(container: str, db: str) -> list[str]:
    # Read the table list from the catalog rather than hardcoding it, so a table
    # added by a future migration is backed up and counted without anyone
    # remembering to edit this file.
    rows = psql(
        container,
        db,
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = 'public' and c.relkind = 'r' order by 1",
    )
    return [r[0] for r in rows]


def live_row_counts(container: str, db: str, tables: list[str]) -> dict[str, int]:
    if not tables:
        return {}
    # One statement, one line: UNION ALL over exact counts (never reltuples,
    # which is an estimate and would make the emptiness check meaningless).
    #
    # TWO KINDS OF VALUE FROM ONE NAME. `t` is a relation name read out of the
    # catalogue by public_tables(), so it is an IDENTIFIER in the FROM clause and
    # a string LITERAL in the label that carries it back. The schema qualifier
    # stays hardcoded because public_tables() only ever returns relations in
    # public — that `public.` is this program's own choice, not a value from
    # outside it.
    parts = [f"select {quote_literal(t)} as t, count(*) as n"
             f" from public.{quote_ident(t)}" for t in tables]
    sql = " union all ".join(parts) + " order by 1"
    return {r[0]: int(r[1]) for r in psql(container, db, sql)}


def database_facts(container: str, db: str) -> dict[str, object]:
    rows = psql(
        container,
        db,
        # A LITERAL, not an identifier: `db` is compared against datname here, it
        # names no object. It comes from --db, or from APP_DATABASE_URL.
        "select pg_get_userbyid(d.datdba), pg_encoding_to_char(d.encoding), d.datcollate,"
        " d.datctype, d.datlocprovider::text from pg_database d"
        f" where d.datname = {quote_literal(db)}",
    )
    if not rows:
        fail(f"database {db!r} not found")
    owner, encoding, collate, ctype, provider = rows[0]

    acl = [
        {"grantee": ("PUBLIC" if r[0] == "" else r[0]), "privilege": r[1]}
        for r in psql(
            container,
            db,
            "select case when a.grantee = 0 then '' else pg_get_userbyid(a.grantee) end,"
            " a.privilege_type from pg_database d, aclexplode(d.datacl) a"
            f" where d.datname = {quote_literal(db)} order by 1, 2",
        )
    ]
    settings = [
        r[0]
        for r in psql(
            container,
            db,
            "select coalesce(array_to_string(s.setconfig, ' '), '') from pg_db_role_setting s"
            " join pg_database d on d.oid = s.setdatabase where d.datname ="
            f" {quote_literal(db)}",
        )
    ]
    return {
        "name": db,
        "owner": owner,
        "encoding": encoding,
        "collate": collate,
        "ctype": ctype,
        "locale_provider": provider,
        "acl": acl,
        "settings": settings,
    }


def render_database_sql(facts: dict[str, object]) -> str:
    """The database-level DDL, generated from the catalog (not parsed out of pg_dump).

    pg_dump emits CREATE DATABASE and the database ACL only under --create,
    and that output hard-codes the database name and a `\\connect`. Generating
    these few statements ourselves keeps the body dump name-agnostic, which is
    what makes a restore into a SCRATCH database possible at all.
    """
    if facts["locale_provider"] != "c":
        # 'c' = libc. An ICU-collated database needs LOCALE_PROVIDER/ICU_LOCALE
        # instead, and guessing that would produce a database that sorts
        # differently from the original. Refuse rather than invent.
        fail(
            f"database locale provider is {facts['locale_provider']!r}, not libc;"
            " this script only renders libc CREATE DATABASE — extend it before relying on it"
        )
    name = facts["name"]
    lines = [
        "--",
        f"-- Database-level objects for {name!r}, generated by scripts/backup_db.py",
        "-- from the catalog at dump time. Apply this BEFORE recycle.sql when",
        "-- rebuilding from nothing; the restore script builds its own CREATE",
        "-- DATABASE when restoring under a different name.",
        "--",
        "",
        # The database and its OWNER are identifiers; the encoding and the two
        # locales are string literals. Same three-way split as everywhere else.
        f"CREATE DATABASE {quote_ident(str(name))} WITH TEMPLATE = template0"
        f" ENCODING = {quote_literal(str(facts['encoding']))}"
        f" LC_COLLATE = {quote_literal(str(facts['collate']))}"
        f" LC_CTYPE = {quote_literal(str(facts['ctype']))}"
        f" OWNER = {quote_ident(str(facts['owner']))};",
        "",
        f"REVOKE ALL ON DATABASE {quote_ident(str(name))} FROM PUBLIC;",
    ]
    for entry in facts["acl"]:  # type: ignore[union-attr]
        # The PRIVILEGE is a keyword, NOT an identifier, and is deliberately left
        # bare: `GRANT "CONNECT" ON DATABASE` is a syntax error, so quoting it
        # would break every disaster-recovery run rather than harden one. PUBLIC
        # is a keyword too, which is why it keeps its exception instead of
        # becoming a role literally named "PUBLIC".
        grantee = entry["grantee"]
        target = "PUBLIC" if grantee == "PUBLIC" else quote_ident(str(grantee))
        lines.append(f"GRANT {entry['privilege']} ON DATABASE"
                     f" {quote_ident(str(name))} TO {target};")
    for setting in facts["settings"]:  # type: ignore[union-attr]
        for item in str(setting).split(" "):
            if item:
                key, _, value = item.partition("=")
                # The GUC KEY is left bare for the same reason: a custom setting
                # carries a dot that belongs to the NAME, so quoting it as one
                # identifier changes its meaning. The VALUE is a literal.
                lines.append(f"ALTER DATABASE {quote_ident(str(name))} SET {key} ="
                             f" {quote_literal(value)};")
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# dump verification: does the FILE actually contain the rows?
# ---------------------------------------------------------------------------
def copy_block_counts(path: Path) -> dict[str, int]:
    """Count the data rows pg_dump wrote per table, by reading the dump itself.

    This is deliberately derived from the FILE, not from either database. It is
    the only evidence that survives if both the source and the restore target
    are wrong, and it is what turns "the script exited 0" into "the rows are in
    there".

    Plain-format COPY data cannot contain a bare newline or a line that is
    exactly `\\.` — COPY TEXT escapes both — so line counting is exact.
    """
    counts: dict[str, int] = {}
    current: str | None = None
    n = 0
    # encoding pinned; the default here would be cp874 and would raise or lie.
    with path.open("r", encoding="utf-8", newline="") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if current is None:
                if line.startswith("COPY ") and line.endswith("FROM stdin;"):
                    table = line.split(" ", 2)[1]
                    current = table.split("(")[0].strip()
                    if current.startswith("public."):
                        current = current[len("public."):]
                    n = 0
                continue
            if line == "\\.":
                counts[current] = n
                current = None
                continue
            n += 1
    if current is not None:
        fail(f"dump is truncated: COPY block for {current!r} has no terminator")
    return counts


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Plain-file backup of the recycle database.")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT,
                    help=f"backup root on the HOST (default: {DEFAULT_OUT})")
    ap.add_argument("--container", default=DEFAULT_CONTAINER,
                    help=f"postgres container name (default: {DEFAULT_CONTAINER})")
    ap.add_argument("--db", default=db_name_from_env(),
                    help="database to dump (default: from APP_DATABASE_URL)")
    ap.add_argument("--label", default="",
                    help="optional suffix on the directory name, e.g. --label pre-upgrade")
    args = ap.parse_args()

    started = dt.datetime.now(dt.timezone.utc)
    stamp = started.strftime("%Y%m%dT%H%M%SZ")

    print("=== preflight ===")
    ps = run(["docker", "ps", "--filter", f"name=^{args.container}$",
              "--format", "{{.Names}} {{.Status}}"])
    if ps.returncode != 0:
        fail(f"docker is not answering: {err_text(ps)}")
    status = ps.stdout.decode("utf-8", errors="replace").strip()
    if not status:
        fail(f"container {args.container!r} is not running (docker compose up -d)")
    print(f"  container      : {status}")

    # Superuser or bust. A NOBYPASSRLS role produces either a hard pg_dump error
    # or, with --enable-row-security, an empty backup.
    # rolsuper::text renders 'true'/'false' (psql only shows t/f for an uncast
    # boolean) — comparing against 't' here silently failed every check once.
    su = psql(args.container, args.db, "select current_user, rolsuper::text from pg_roles"
                                       " where rolname = current_user")[0]
    if su[1] != "true":
        fail(f"connected as {su[0]!r}, which is not a superuser — under FORCE RLS this"
             " cannot dump other tenants' rows")
    server_version = psql(args.container, args.db, "select version()")[0][0]
    print(f"  role           : {su[0]} (superuser)")
    print(f"  server         : {server_version.split(' on ')[0]}")

    facts = database_facts(args.container, args.db)
    roles = cluster_roles(args.container, args.db)
    tables = public_tables(args.container, args.db)
    counts_live = live_row_counts(args.container, args.db, tables)
    print(f"  database       : {args.db} (owner {facts['owner']}, {facts['encoding']})")
    print(f"  tables         : {len(tables)}")
    print(f"  roles          : {', '.join(str(r['name']) for r in roles)}")

    dirname = f"{args.db}_{stamp}" + (f"_{args.label}" if args.label else "")
    outdir: Path = args.out / dirname
    outdir.mkdir(parents=True, exist_ok=False)
    tmp = f"/tmp/backup_{stamp}"
    print(f"  destination    : {outdir}")

    try:
        print("\n=== dump ===")
        mk = docker_exec(args.container, ["mkdir", "-p", tmp])
        if mk.returncode != 0:
            fail(f"could not create {tmp} in the container: {err_text(mk)}")

        # 1. cluster roles (superuser-only: it reads password hashes from pg_authid)
        cp = docker_exec(args.container, [
            "pg_dumpall", "-U", SUPERUSER, "--globals-only", "-f", f"{tmp}/globals.sql",
        ])
        if cp.returncode != 0:
            fail(f"pg_dumpall --globals-only failed: {err_text(cp)}")
        print("  globals.sql    : roles, attributes, password hashes")

        # 2. schema + data. NO --create (see the module docstring): the body must
        #    stay retargetable, or a scratch restore writes into the live database.
        cp = docker_exec(args.container, [
            "pg_dump", "-U", SUPERUSER, "-d", args.db,
            "--format=plain", "--encoding=UTF8",
            "-f", f"{tmp}/{args.db}.sql",
        ])
        if cp.returncode != 0:
            fail(f"pg_dump failed: {err_text(cp)}")
        print(f"  {args.db}.sql   : schema + data + grants + RLS policies")

        for fname in ("globals.sql", f"{args.db}.sql"):
            cp = run(["docker", "cp", f"{args.container}:{tmp}/{fname}", str(outdir / fname)])
            if cp.returncode != 0:
                fail(f"docker cp {fname} failed: {err_text(cp)}")
    finally:
        # Best effort; a leftover /tmp dir in the container is harmless but noisy.
        docker_exec(args.container, ["rm", "-rf", tmp])

    # 3. database-level DDL, generated locally. Written as UTF-8 bytes with an
    #    explicit newline='\n' so the file is byte-identical on any host.
    body = outdir / f"{args.db}.sql"
    (outdir / "database.sql").write_text(render_database_sql(facts), encoding="utf-8", newline="\n")
    print("  database.sql   : CREATE DATABASE + database ACL")

    print("\n=== verify the dump is not empty ===")
    counts_dump = copy_block_counts(body)
    missing = [t for t in tables if t not in counts_dump]
    if missing:
        fail(f"tables with no COPY block in the dump at all: {missing}")
    silent_empty = [t for t in tables if counts_live.get(t, 0) > 0 and counts_dump[t] == 0]
    if silent_empty:
        fail(
            "these tables have rows in the database and ZERO rows in the dump: "
            f"{silent_empty} — this is the RLS silent-empty backup; do not ship it"
        )
    drift = {t: (counts_live.get(t, 0), counts_dump[t])
             for t in tables if counts_live.get(t, 0) != counts_dump[t]}
    for t in tables:
        print(f"  {t:<22} db={counts_live.get(t, 0):>6}  dump={counts_dump[t]:>6}")
    if drift:
        # Not a failure: pg_dump's snapshot is taken before these counts, so a
        # concurrent write legitimately shows up here. It IS worth printing.
        print(f"  note: counted after the snapshot, so live/dump differ for {sorted(drift)}"
              " — writes landed during the dump")

    print("\n=== manifest ===")
    files = {}
    for path in sorted(outdir.iterdir()):
        files[path.name] = {"bytes": path.stat().st_size, "sha256": sha256_of(path)}
    finished = dt.datetime.now(dt.timezone.utc)

    manifest = {
        "tool": "scripts/backup_db.py",
        "started_utc": started.isoformat(),
        "finished_utc": finished.isoformat(),
        "container": args.container,
        "server_version": server_version,
        "database": facts,
        "roles": roles,
        "body_file": body.name,
        "tables": tables,
        "row_counts_in_dump": counts_dump,
        "row_counts_live_after_snapshot": counts_live,
        "files": files,
    }
    (outdir / "MANIFEST.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8", newline="\n"
    )
    (outdir / "checksums.sha256").write_text(
        "# The three dump files. MANIFEST.json / MANIFEST.txt / this file are\n"
        "# written afterwards and so cannot appear here; MANIFEST.json is the\n"
        "# trust anchor the restore reads. Verify with: sha256sum -c checksums.sha256\n"
        + "".join(f"{v['sha256']}  {k}\n" for k, v in sorted(files.items())),
        encoding="utf-8", newline="\n",
    )

    total = sum(f["bytes"] for f in files.values())
    rows = sum(counts_dump.values())
    human = f"""Recycle Online — database backup
================================

Taken     : {started.isoformat()}  (UTC; this file never renders shop time —
            that lives in app.config.SHOP_TIMEZONE and a backup artifact has no
            business owning a second copy of it)
Source    : container {args.container}, database {args.db}
Server    : {server_version}
Rows      : {rows} across {len(tables)} tables
Size      : {total} bytes in {len(files)} files

FILES
  globals.sql       cluster roles + attributes + PASSWORD HASHES
  database.sql      CREATE DATABASE (owner/encoding/locale) + database ACL
  {body.name:<17} schema, all data, ownership, grants, RLS policies
  MANIFEST.json     the same facts, machine-readable (the restore reads this)
  checksums.sha256  sha256 per file; the restore refuses a mismatch

TO REBUILD FROM NOTHING (empty cluster)
  psql -U postgres -f globals.sql
  psql -U postgres -f database.sql
  psql -U postgres -d {args.db} -f {body.name}
  ...or let scripts/restore_db.py do it:
  python scripts/restore_db.py <this directory> --into {args.db} --with-globals

WHAT IS **NOT** IN THIS BACKUP
  * Anything written after {started.isoformat()}. pg_dump takes ONE snapshot at
    its start. There is no WAL archiving and no point-in-time recovery, so
    every bill taken between two backups is lost with the disk. If this runs
    nightly, the honest worst case is A FULL DAY of purchases.
  * server/.env, and so JWT_SECRET. Restoring onto a box with a different
    secret restores every bill correctly and invalidates every issued token
    (staff sign in again). Back that file up separately — it is a credential.
  * Bills that are still only on a phone. The app is offline-first; a pending
    bill has never reached Postgres. Not lost, but not here either — it syncs
    when the phone next reaches a server.
  * Application code, migrations, db/init — those live in git.
  * Any other database in this cluster.
  * Encryption and off-site copies. THIS DIRECTORY HOLDS UNENCRYPTED MONEY DATA
    AND CLUSTER PASSWORD HASHES. Protect it exactly like the database.

ROW COUNTS (counted in the dump file itself, not reported by the database)
"""
    human += "".join(f"  {t:<24} {counts_dump[t]}\n" for t in tables)
    (outdir / "MANIFEST.txt").write_text(human, encoding="utf-8", newline="\n")

    # checksums.sha256 and the manifests are written after the hashing pass, so
    # they are not self-referentially hashed. Say so rather than implying cover.
    print(f"  {len(files)} files, {total} bytes, {rows} rows")
    print(f"\nBACKUP OK: {outdir}")
    print("  (globals.sql contains password hashes; this directory is as sensitive as the DB)")
    return 0


if __name__ == "__main__":
    code = main()
    print(f"BACKUP_EXIT={code}")
    sys.exit(code)
