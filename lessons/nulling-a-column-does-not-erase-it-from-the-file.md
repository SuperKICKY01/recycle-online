# Nulling a column does not erase it from the file

**Applies to** every requirement phrased "the device must no longer HOLD x" — a personal ID, a
token, a secret — on any SQLite database, and to every proof of one.

**The rule, in one line:** a row that reads NULL is a claim about the ROW; what the device holds is
the FILE, and the file keeps the old bytes until something overwrites them.

## What happened

H3 (ADVISOR-DECIDED 2026-10-23): a phone-created seller's full ID must leave the phone once the
seller syncs. The settle was changed to `SET id_number = NULL, id_last4 = ?` in the UPDATE that marks
the row `synced`, and every row-level cell went green — read back by raw SQL, `id_number` NULL.

The proof also searched the database FILE's bytes for the ID, with a control (an owed seller's ID in
the same file, which must be found). Measured on node:sqlite:

| guard in place | connection open | after close |
| --- | --- | --- |
| NULL only | **FOUND** | **FOUND** |
| NULL + `PRAGMA secure_delete = ON` | **FOUND** (WAL) | absent |
| NULL + secure_delete + `wal_checkpoint(TRUNCATE)` after the settle | absent | absent |

Two separate places held it. An UPDATE that shortens a record leaves the old cell's bytes in the
page's free space unless `secure_delete` zeroes them. And in WAL mode every write while the row was
owed (the INSERT, the claim, a failed attempt) appended a full page image to the WAL; those frames
stay in the `-wal` file until a checkpoint copies the current pages back and the WAL is reset —
which happens at a close, so "after close" looks clean while the running app still holds the ID.

## The rules

- **Measure the file, not the row.** Read the database file AND its `-wal` for the value's bytes,
  both with the connection open and after a close — the two answers differ.
- **Every absence needs a control in the same file**: a value that IS still held must be FOUND by
  the same search, or "absent" may be a search that cannot see.
- **`secure_delete` for the page, a TRUNCATE checkpoint for the WAL** — each guard was disproved
  alone, and each covers a different window.
- **The row-level green is the trap.** Every reader of the table agrees the value is gone, which is
  exactly why nobody looks further.

## Bounds

Measured on node:sqlite only. The handset's expo-sqlite build, its filesystem, and anything below
SQLite (flash wear-levelling, the OS's own caches, a backup) are UNMEASURED and not covered by this.

**Amended 2026-10-23 (D2, emulator walk, measured): the guards erase the CELL THEY TOUCH, NOT EVERY
OLD COPY OF IT.** On the emulator's expo-sqlite the guards held for the ID they were built for: it was
in the WAL before the settle and nowhere in the file, WAL or shm after. But a seeded cached seller's phone
had a SECOND copy of its whole row in the unused space of the `cached_sellers` ROOT page, which is now an
interior b-tree page. D1's sign-out cleared the live row (no table row holds the phone, freelist 0), and
the stale copy stayed. A table that is rewritten wholesale (delete and re-insert) and grows past one page
leaves such copies; a proof whose table fits in one leaf page cannot see them. So a byte-level claim
needs a fixture at REALISTIC SIZE, and "erased" holds only for the cells the statement wrote. Clearing
every old copy is a rebuild of the file (VACUUM, UNMEASURED), not a pragma. Where recorded:
`OPEN_ITEMS.md § Verification gaps` D2.

## Where proven

`mobile/src/proof/proveSellerIdLocal.ts` S6 (with its three disproofs in the header);
the guards are `mobile/src/adapters/sqlite/schema.ts` CONNECTION_PRAGMAS and
`SqliteLocalSellerStore.markSellerCreated`.

Related: [[a-check-that-never-went-red-was-never-observed]], [[console-is-not-the-observation]]
(an absence controlled by a needle of the same class).
