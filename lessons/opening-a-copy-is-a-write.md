# Opening a copy is a write to it

**Applies to** every artefact you copy in order to measure it — a database pulled
off a device, a snapshot taken before and after a change, a control fixture built
to validate a read route — and hardest to SQLite in WAL mode, where the data is
TWO files and only the pair is the data.

**The rule:** a reader can MUTATE the artefact it reads. SQLite checkpoints the
`-wal` into the `.db` and DELETES the `-wal` when the last connection closes, so
the moment you open a copy to check it, the bytes on disk stop being the bytes
you just measured. Every size and hash printed before that open is CORRECT, and
describes a state that no longer exists. **Copy every artefact before opening any
of them, and never open the copy that will be used.**

## Instance 1 — the control that certified a pair and shipped a single file

Building a control to prove a device read-route before trusting it on real data.
One db+wal pair was created with rows committed but deliberately not
checkpointed, so that reading the db WITHOUT its wal would visibly fail — the
negative half that makes the control a control:

    known_pair.db       4096 bytes
    known_pair.db-wal  24752 bytes
    with wal    -> 2 tables, 7 rows and 3 rows      (correct)
    without wal -> NO TABLES AT ALL                 (the mistake, visibly)

Both halves passed, and both numbers were true when printed. The script then
closed, and the *verification itself* — opening the pair to read those numbers —
checkpointed the wal into the db and deleted it. On disk afterwards:

    known_pair.db      12288 bytes
    known_pair.db-wal  ABSENT

**The bytes that would have been pushed to the device were a checkpointed single
file, not the pair the log had just certified.** The control would have been
measuring an artefact nobody had checked, and it would have passed — a
checkpointed database reads correctly. The whole point of the negative half, that
a missing wal fails loudly, could not fire, because the wal was not missing: it
had been absorbed.

Caught by `ls` disagreeing with the script's own output one command later. The
repair is not "check afterwards": it is to take every copy while the writer is
still open, and to keep the copy that will be used SEPARATE from the copy that
gets read.

## Instance 2 — the comparison that could no longer be made

A different pass, two device snapshots taken either side of a sign-out, to
establish whether the sign-out wrote to the local database at all. Both were
pulled correctly, db and wal each:

    signedin.db  98304   signedin.db-wal  41232
    signedout.db 98304   signedout.db-wal 41232

The inspector was then run on the first. That opened it, checkpointed it, and
deleted `signedin.db-wal` — so when the comparison came to run, one side's wal
did not exist and the raw pair could never be compared at all. What survived was
weaker than what had been planned: the pre-open hashes (identical), the wal
SIZES (identical), and the post-recovery content (identical, `ed92840b…`). The
conclusion held, but by a narrower argument than the one designed, and only
because three weaker facts happened to agree.

**Twice, in two separate passes, by two different routes.** The first destroyed a
fixture before it was used; the second destroyed evidence after it was gathered.

## Why nothing catches it

There is no error, no exit code and no red. The reader succeeds, the numbers it
prints are accurate, and `PRAGMA integrity_check` returns `ok` on both the pair
and the checkpointed file — because both are valid databases. The artefact simply
becomes a DIFFERENT valid database between the measurement and its use, and the
only tell is a file listing nobody takes twice.

It is also invisible to the discipline that would normally catch it. Hashing the
artefact does not help if the hash is taken before the open and used after it,
which is the natural order. And "verify the control before trusting it" — the
right instinct, and the one this repository teaches — is the very act that breaks
it.

## What to do

- **Copy every artefact BEFORE opening any of them.** If two snapshots are to be
  compared, both copies exist before either is read.
- **Never open the copy that will be used.** Take a separate copy to read from;
  they are cheap.
- **Where the copies come from a live writer, take them all while that writer is
  still open**, and hash them at that moment.
- **Say WHICH object a number describes** — the raw copy, or the file after WAL
  recovery. They are different bytes with different hashes, and only the first is
  what was on the device. Same discipline `CLAUDE.md § Machine footguns`
  "`core.autocrlf`" demands for blob versus working tree, arriving from the other
  direction: there two objects are confused for one, here one object becomes two
  over time.
- **Read the artefact back after the run, not only before it**, when a fixture is
  going to be handed to something else.

## Why it is a lesson and not a machine footgun

It was first written into `CLAUDE.md`'s footgun section and moved here, by that
section's own test. A footgun is what would cause a WRONG DIAGNOSIS on this
Windows box; this is SQLite's documented close behaviour and would happen on any
machine, in any language, with any reader. `CLAUDE.md § Workflow`
"Two homes, one test" puts it here.

**Sibling of `the-observer-is-a-writer-to-what-it-observes.md`**, separated by
direction. There the instrument writes into the MEDIUM it is measuring — a scan
whose own command lands in the log it greps. Here the instrument rewrites the
ARTEFACT it opens, and the medium is untouched. Both end the same way: a reading
that describes something other than the thing you meant to measure.
