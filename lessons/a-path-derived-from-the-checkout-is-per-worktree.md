# A path derived from the checkout is per worktree

**Applies to** every lock, scratch name, output directory or "where the backups are"
default that is computed from the script's own location (`Path(__file__)`, `REPO`,
`REPO.parent`), the moment more than one checkout of this repository can run on the box.

## What happened (lane zero, 2026-10-11)

The brief for running two lanes in parallel suggested `prove_all`'s exclusive lock
could live "at the repo root". Each lane works in its OWN git worktree, so each has its
own repo root, and a lock there would be taken by both lanes at once. The lock would
exclude nothing: two gates, three uvicorns each, the one dev database and the one
Postgres cluster shared, and no error from either. The same survey found two defaults
that were silently wrong in a worktree: `prove_all`'s `--pre0018` and `--out` were
`REPO.parent / "recycle-online-backups"`. In `.claude/worktrees/a` that is
`.claude/worktrees/recycle-online-backups`, which does not hold the 0017 backup, so the
gate would refuse in every worktree.
NOT RUN, and labelled so: creating a worktree was outside that phase. Both readings
follow from `REPO = Path(__file__).resolve().parent.parent` (`tools/prove_all.py`), and
they are ASSUMED-BECAUSE of that line until a lane's first gate runs inside a worktree.

## Rule

Ask what the contended RESOURCE is before choosing where its lock or name lives. The
one Postgres cluster, the dev database, the box's memory and `E:\recycle-online-backups`
are per MACHINE. A lock or name for them must live where every checkout sees the SAME
thing (`%TEMP%`, a database name carrying the lane tag, an environment variable such as
`RECYCLE_BACKUP_DIR`), never somewhere derived from the checkout. And the opposite
direction: what really is per checkout (`dist/`, `node_modules`, logs of one tree) must
NOT be shared.

The test is cheap and has to be run, not reasoned about: evaluate the path from a
second checkout and compare. Two lanes that each print "lock taken" are the failure,
not the proof.
