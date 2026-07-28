# Backup and restore — runbook

Two scripts and a proof. The money data lives in exactly one place today: the
docker named volume `recycle_pgdata`. `docker compose down -v` erases it, and
so does a dead disk.

Scope: the local docker-compose Postgres (`recycle_pg`). That is the only
deployment that exists — there is no cloud host to back up yet.

## Daily

Run from `server/`:

```
python scripts/backup_db.py
```

Writes a timestamped directory under `E:\recycle-online-backups\` (override
with `--out` or `RECYCLE_BACKUP_DIR`) containing `globals.sql`,
`database.sql`, `recycle.sql`, `MANIFEST.json`, `MANIFEST.txt` and
`checksums.sha256`.

It worked if the last lines read `BACKUP OK: <path>` and `BACKUP_EXIT=0`, and
the per-table table above them shows `db=` and `dump=` agreeing with non-zero
counts. A zero in the `dump=` column against a non-zero `db=` is a hard
failure and the script refuses to finish — that is the row-level-security
silent-empty backup (`lessons/a-backup-is-a-claim-until-it-is-restored.md`).

**This directory is as sensitive as the database.** `globals.sql` carries the
cluster password hashes and `recycle.sql` carries every bill, unencrypted.

## Verify a backup (harmless, do it often)

```
python scripts/restore_db.py <backup dir> --into recycle_restore_scratch
```

Restores into a scratch database. The live one is not touched. Ends with
`RESTORE OK` and `RESTORE_EXIT=0`.

The full round trip, including the check that the restore reflects the dump's
moment rather than the live database:

```
python scripts/prove_backup_restore.py
```

Ends with `ALL BACKUP/RESTORE CASES PASSED` and `BACKUP_RESTORE_EXIT=0`. It
leaves a marker bill in the source on purpose — bills are never hard deleted
(hard rule 5) — and its dump directories accumulate under `_proof/`, which are
safe to delete.

## 07:00, the disk is dead

1. New box, Docker installed, repo cloned, and the backup directory in hand.
2. `cd server && docker compose up -d` — an empty cluster. Do **not** run the
   migrations, and do not run `seed_dev.py`; the backup carries the schema and
   the data.
3. Restore everything, roles included:

   ```
   python scripts/restore_db.py <backup dir> --into recycle --with-globals
   ```

   `--with-globals` is for an empty cluster. It will print
   `ERROR: role "postgres" already exists` — that is expected and harmless;
   `pg_dumpall` always emits it. The script does not judge that step by its
   exit code, it checks afterwards that every recorded role came back with the
   right `superuser` / `bypassrls`, and fails if one did not.
4. Put `server/.env` back. It is **not** in the backup. A different
   `JWT_SECRET` restores every bill correctly and invalidates every issued
   token, so staff sign in again.
5. `uvicorn app.main:app --host 0.0.0.0` and log in from a phone.

Restoring over an existing `recycle` needs `--overwrite-live`. The gate fires
on data that exists, not on a name, so step 3 on a fresh cluster needs no flag.

### What you have lost

Everything written after the last successful backup. `pg_dump` takes one
snapshot when it starts; there is no WAL archiving and no point-in-time
recovery here. **If this runs nightly, the honest worst case is a full day of
purchases** — every bill bought and paid for since the last dump is gone from
the server.

Two things soften it, and neither is a substitute:

* Bills still pending on a phone are not lost. The app is offline-first, so
  they sync to the restored server when it comes back.
* Bills that had already synced and were then lost with the disk are gone from
  the server, but the yard has paper slips and the phone that created them.

If a day is too much, the fix is more frequent backups plus WAL archiving —
not a longer runbook.

## Deliberately not built

No scheduling, no cloud or off-site upload, no retention or pruning, no
encryption at rest. A backup that only ever exists on the same box as the
database survives `down -v` and a bad migration; it does not survive the fire,
the theft, or the ransomware. Off-site is the next thing to add, and until it
exists the honest statement is "we have a local backup", not "we have backups".
