# A backup is a claim until it has been restored

Applies to every dump, restore and verification path — and to anything else
whose success is reported by an exit code rather than by inspecting what was
produced.

`backup_db.py` exiting 0 says a process ran. It does not say rows are in the
file, that the file will land where you point it, or that what comes back is
still tenant-isolated. Each of those failed differently while this was built,
and every one of them fails GREEN.

## 1. The tenant model is also the way a backup captures nothing

Every business table is `ENABLE` + `FORCE ROW LEVEL SECURITY` and the policy
reads `app.tenant_id`, which no backup ever sets. Unset means no rows — the
system fails closed, which is exactly right for the API and exactly fatal for a
dump. A dump taken by `recycle_owner` or `recycle_app` fails loudly:

    pg_dump: error: query failed: ERROR: query would be affected by
    row-level security policy for table "sellers"

The trap is the obvious fix. `--enable-row-security` makes that error go away
by letting the policy apply — so pg_dump succeeds, exits 0, and writes a
schema-shaped file with **zero rows in it**. Never add that flag. Dump as a
role that can see every tenant, and prove it: count the rows **in the dump
file** and fail if a table has rows in the database and none in the file.

A count taken from the database is not evidence about the file. Parse the
`COPY ... FROM stdin;` blocks. That number is the only one that survives if
both the source and the restore target are wrong.

## 2. `--create` writes the target database name INTO the body

`pg_dump --create` is the natural choice for "reconstruct from nothing" — it
emits `CREATE DATABASE recycle` and then `\connect recycle`. That `\connect` is
a psql meta-command inside the file, and it wins over `-d`. Feed such a file to
`psql -d recycle_restore_scratch` and psql switches to the LIVE database
partway through and restores into it. A verification step silently becomes an
overwrite of production.

Take the body WITHOUT `--create` so it is retargetable, generate the
database-level DDL (owner, encoding, locale, ACL) from the catalog separately,
and have the restore re-check that the body contains no `\connect` before it
runs. The checksum gate does not cover this: a dump taken the wrong way has a
perfectly valid checksum.

## 3. An exit code that is guaranteed to be non-zero is not a verdict

`pg_dumpall --globals-only` always emits `CREATE ROLE postgres;`. On any
cluster you were able to connect to, that role exists — you are connected as
it. With `ON_ERROR_STOP=1` the roles step therefore aborts disaster recovery on
an error that means nothing. The following `ALTER ROLE` still applies the
attributes and the password.

So that one step must not be judged by its exit code. Judge the END STATE:
every role the backup recorded exists, with the recorded `rolsuper` and
`rolbypassrls`. That check is not bookkeeping — a `recycle_app` restored with
`BYPASSRLS` reads every tenant's rows while the policies sit there looking
correct, and nothing in the application would notice.

## 4. "Restored matches source" is vacuous unless the source has moved

Restore into a scratch database, compare against the source, all green — and a
restore that did absolutely nothing passes, because the verification queries
could be reading the live database and no one would know.

Make the two databases disagree on purpose. Mutate the source AFTER the dump,
then assert the restored copy shows the DUMP's moment and not the source's:

* a marker bill written after the dump is present in the source and **absent**
  from the restore;
* the `doc_no` counter reads one lower in the restore than in the source.

Those two invert or collapse the moment a check reads the wrong database, so
they are the first thing to look at when this proof goes green after a change.

Compare money and weight as TEXT, digit for digit — a float comparison can
agree while the digits differ. Compare Thai as UTF-8 hex, never by eye
(see [[console-is-not-the-observation]]).

## 5. What a restore cannot restore

The moment. `pg_dump` reads one repeatable-read snapshot at its start, so the
file is internally consistent and frozen there. With no WAL archiving there is
no point-in-time recovery, and everything written between two backups is gone
with the disk. Say the window out loud — "up to a day" — rather than letting
"we have backups" imply otherwise.
