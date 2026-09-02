# A cache key must distinguish the values it caches — or a corrective write is masked

Applies whenever a value is cached against cheap metadata instead of re-read: a
file's `(mtime, size)`, an ETag, a version counter, a "last modified" stamp. The key
is only as good as its power to tell two DIFFERENT values apart. If two distinct
values can share a key, the cache returns the stale one and the fresh write silently
does nothing — and the write most likely to be masked is the CORRECTIVE one made in
a hurry right after a mistake.

## What happened (red-team finding 7, version contract)

`version_gate.current_floor` cached the API-version floor against `(st_mtime_ns,
st_size)` of a one-byte file, so an operator's edit would be picked up "with no
restart." But every floor value is one byte, so `size` never discriminates, and on
this box `st_mtime_ns` granularity is coarse enough that two back-to-back writes
share a tick: **measured 169/200 (85%) identical `(st_mtime_ns, st_size)` over
same-size back-to-back writes, ~1.35 ms apart.** So the exact recovery the floor
depends on — raise to `2`, realise it was wrong, write `1` a moment later — could be
masked: the cache keeps serving `2` and keeps refusing the fleet the correction was
meant to admit. A floor that cannot be lowered promptly is worse than no floor.

## The fix, and the general rule

The file is tiny and the OS caches it in memory, so the cache bought nothing real.
Read the CONTENT every call; there is then no key to collide. More generally: before
caching a value against metadata, ask **can two values I need to tell apart produce
the same key?** For a small mutable config file the answer is yes (same size, same
clock tick), so do not cache it on stat metadata at all — the read is already cheap.
Where a cache is genuinely worth it, the key must be a function of the CONTENT (a
hash), never of stat fields the content does not move.

The box-specific half — this machine's `st_mtime_ns` resolution — is why the
collision was frequent rather than rare, but the principle is not box-specific: a
one-byte value has a one-value-wide size dimension anywhere.

**Where proven.** `server/app/version_gate.py::current_floor` (content read, cache
removed), `server/scripts/prove_version_gate.py` Phase D — a corrective lower floor
(`2 -> 1`, same byte size, back-to-back) is honoured on the very next request.
