# Disaster recovery — one page, for the day the machine is gone

Use this when the machine is lost (fire, theft, dead box) and you have only two
things: the **GitHub remote** and the **backup USB drive**. If only the database
is broken but the machine is fine, you do not need this page — restore into a
scratch and swap, per `server/scripts/BACKUP.md`.

> **A backup directory is a CREDENTIAL STORE, not a data file.** Every
> `recycle_<timestamp>` directory holds `globals.sql` (the cluster **password
> hashes**) and `env/.env` (the DB passwords and `JWT_SECRET`), in cleartext.
> Treat the USB drive exactly like the machine: never let it travel casually,
> never hand it to anyone, and if it is ever lost, rotate every secret it held.

## What you are recovering

Three single-copy assets, all on the USB drive under the newest
`recycle_<timestamp>` directory:

1. the **database** — `recycle.sql` + `globals.sql` + `database.sql`;
2. **`server/.env`** — the copy under `env/.env`;
3. the **code revision** the schema matches — `SOURCE_REVISION.json`.

## The steps, in order

1. **New box.** Install Docker Desktop and Git. Clone the repo:
   `git clone <your GitHub remote> recycle-online`.

2. **Check out the matching commit.** Read `SOURCE_REVISION.json` in the newest
   backup directory; it names `git_head`. `git checkout <that sha>`. (If
   `git_tree_dirty` was `true`, the box had uncommitted changes when the dump was
   taken — the committed code is the closest match; note the discrepancy.)

3. **Empty cluster.** `cd server && docker compose up -d`. **Do NOT** run the
   migrations and **do NOT** run `seed_dev.py` — the backup carries the schema and
   all the data. Create the server venv the scripts use (`uv sync`, or your usual
   setup), so `restore_db.py` can run.

4. **Restore everything, roles included**, from the newest backup directory on the
   USB drive:

   ```
   server\.venv\Scripts\python.exe server\scripts\restore_db.py D:\recycle-backups\recycle_<newest> --into recycle --with-globals
   ```

   `--with-globals` is for an empty cluster; it restores the roles and their
   password hashes. It prints `ERROR: role "postgres" already exists` — that is
   expected and harmless (`pg_dumpall` always emits it); the script does not judge
   that step by its exit code, it checks the end state and fails if any role came
   back wrong. It ends with `RESTORE OK` and `RESTORE_EXIT=0`.

5. **Put `server/.env` back.** It is **not** applied by the restore — it is a
   credential. Copy the backup's `env\.env` to `server\.env`. Which values must be
   **recovered** (not minted), and why:

   - **The three DSN passwords** (`APP_DATABASE_URL`, `MIGRATION_DATABASE_URL`,
     `DIRECTORY_DATABASE_URL`) **must be recovered.** Step 4 restored the role
     password *hashes* from `globals.sql`; the DSN passwords in `.env` must match
     those hashes or the app cannot connect. Recover them from the backup's
     `env/.env` and they match by construction.
   - **`JWT_SECRET` should be recovered.** You *can* mint a fresh one, and every
     bill restores correctly either way — but minting a new secret **invalidates
     every issued token**, so every staff member must sign in again. Recovering the
     old secret keeps live sessions valid. Recover it unless you have a reason to
     rotate it (e.g. the drive was exposed).
   - **`PROVISION_ADMIN_PASSWORD` may be minted.** It is only used to provision a
     new shop's first admin; set a fresh value if you like.

6. **Start and check.** `cd server && uvicorn app.main:app --host 0.0.0.0`, then
   sign in from a phone against the new address. Run
   `server\.venv\Scripts\python.exe server\scripts\reconcile.py` — it should exit 0.

## What you have lost

Everything written after the newest dump — `pg_dump` takes one snapshot when it
starts and there is no point-in-time recovery here, so the honest worst case is
**up to a day of purchases** (the daily backup interval). Two things soften it and
neither is a substitute: bills still **pending on a phone** are not lost (the app
is offline-first and syncs them to the restored server), and any synced bill lost
with the disk still exists on **paper slips** and on the phone that made it.

## Keeping it running (so this page stays a rehearsal, not a first attempt)

The daily backup and weekly drill run from Windows Task Scheduler. Register them in
**PowerShell** (runs **when you are logged on**, no admin needed; `-StartWhenAvailable`
runs a backup missed while the box slept, as soon as it wakes):

```powershell
$py  = "E:\recycle-online\server\.venv\Scripts\python.exe"
$dir = "E:\recycle-online\server\scripts"
$dest = "D:\recycle-backups"
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "RecycleOnline-Backup-Daily" -Settings $set `
  -Trigger (New-ScheduledTaskTrigger -Daily -At 2:00AM) `
  -Action  (New-ScheduledTaskAction -Execute $py -Argument "`"$dir\safety_net_backup.py`" --dest `"$dest`"")

Register-ScheduledTask -TaskName "RecycleOnline-BackupDrill-Weekly" -Settings $set `
  -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3:00AM) `
  -Action  (New-ScheduledTaskAction -Execute $py -Argument "`"$dir\verify_backup.py`" --dest `"$dest`"")
```

**Elevation:** registering a task that runs as *you*, when logged on, does not need
Administrator. If Windows answers `Access is denied`, run the same two lines from an
elevated PowerShell. Do **not** make it run whether-or-not-logged-on (that stores a
password / needs admin and buys little on a box you use daily).

**When the box is asleep or off:** `-StartWhenAvailable` catches a run missed to sleep
on the next wake. A run missed because the box was OFF all day is not run — but it is
not silent either: the freshness alarm below fires after 3 stale days, whether a run
FAILED or was MISSED, because it measures time since the last *success*, not attempts.

**Failures are loud in two places you already look:** the job writes
`LAST_RUN_FAILED.txt` and `STATUS.txt` to the drive, and after 3 days with no
successful backup `check_backup_freshness.py` writes **`BACKUP_OVERDUE.md` at the repo
root**, which `git status` (and every Claude Code session's opening snapshot) surfaces.
Exit codes: 0 OK · 1 backup failed · 2 could not run · 3 drive unavailable (unplugged) ·
4 destination on the source disk.
