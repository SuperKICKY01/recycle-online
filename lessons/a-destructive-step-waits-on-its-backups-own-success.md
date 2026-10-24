# A destructive step waits on its backup's own success

**Applies to** every command line that saves work and then discards it — `git checkout --`,
`git reset --hard`, `rm`, `git clean`, a restore over a database — written as one invocation after
a backup step (a tar, a copy, a dump, a stash).

**The rule, in one line:** the discard runs only when the backup has been OBSERVED to succeed and
to hold what it was meant to hold; a backup that printed its own failure is not a backup.

## What happened

M1, 2026-10-24T08:16:54Z, lane A worktree. To set the uncommitted desktop work aside, one Bash
invocation listed the changed files, archived them and then reverted the tree:

```
B="C:/Users/…/scratchpad/m1/desk_wip"; …; tar -cf "$B/wip.tar" $(git status --short desktop | awk '{print $2}');
echo "TAR=$?"; git checkout -- desktop; rm -f desktop/src/shared/moneyRules.ts; …
```

Its own output, verbatim: `tar: Cannot connect to C: resolve failed` and `TAR=128`, followed by the
checkout and the `rm`, which ran anyway because `;` is unconditional. Twelve modified desktop files and
one untracked file (`desktop/src/shared/moneyRules.ts`) were discarded with no copy anywhere. GNU tar
reads `host:path` as a REMOTE archive, so the drive letter `C:` was taken for a host name — the
archive was never written. The work was rebuilt from the session's own record of every edit
(`rebuild_desk.py` in the session scratchpad), checked file by file, and committed as `44d4183`.

The printout carried the failure (`TAR=128`) one line above the discard. Printing an exit code is
not gating on it: the reader of that line was the same command line that went on to destroy.

## The rules

- **Gate, do not chain.** The discard is a SEPARATE invocation, issued only after the backup's exit
  code has been read and is 0 — never `;` (unconditional) and not even `&&` in one breath, because
  the second rule cannot run between them.
- **Check the backup's CONTENT, not just its exit.** List the archive (`tar -tf`), or diff the copy
  against the tree, and count the entries against the files you are about to discard. Exit 0 from
  a tool given the wrong path can still be an empty or wrong archive.
- **Prefer the tool that owns the data.** For a git tree, set work aside with git: a WIP commit on
  the branch, or `git stash push -u -m <tag>` with the entry's sha captured at once (the stash
  stack is shared across worktrees). Git refuses loudly where an ad-hoc archive fails quietly.
- **No colon after a drive letter in a path handed to tar** (it is a remote-host separator); the
  same path is fine to the Write tool and to Python.

## Bounds

One occurrence, measured from the session transcript. Whether `&&` alone would have saved it is
UNMEASURED here; it would have stopped this discard, but it does not check content, which is why the
second rule stands on its own.

## Where recorded

The command and its result are in the 2026-10-24 lane A session transcript at the timestamp above;
the rebuilt work landed in `44d4183`.

Related: [[a-check-that-never-went-red-was-never-observed]] (an exit code printed is not an exit code
read), [[correct-classification-can-still-render-as-an-error]].
