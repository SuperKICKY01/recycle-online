"""The lane tag -- ONE place that decides every scratch database name.

Two orchestrator lanes (A mobile, B desktop) may run on this box at once, each in
its own git worktree, against the ONE Postgres cluster in `recycle_pg`. Scratch
database names used to be literals in each proof, so two lanes running the same
proof would DROP and restore the same database under each other. The fix is a
single environment variable, read here and nowhere else:

    RECYCLE_LANE unset or empty  -> every name exactly as before (`recycle_drawer_scratch`)
    RECYCLE_LANE=a               -> `recycle_drawer_scratch_a`

Every proof and tools/prove_all.py calls `scratch_name()` for every scratch it
creates; a literal scratch name anywhere else is the bug this module exists to
prevent. Names a CALLER passes explicitly (`--database x`) are the caller's and are
not rewritten: prove_all suffixes its own before passing them.

A malformed tag RAISES rather than being cleaned up: a tag that cannot be part of
an unquoted identifier would otherwise reach a `CREATE DATABASE`, and a silently
"fixed" tag is a different lane's name. Short lowercase only, so the longest
scratch name stays far below Postgres's 63-byte identifier limit.

Stdlib only: tools/prove_all.py imports this under the system Python, and every
proof imports it as a sibling (`scripts/` is sys.path[0] when a proof runs).
"""
from __future__ import annotations

import os
import re

ENV_VAR = "RECYCLE_LANE"
_TAG = re.compile(r"[a-z][a-z0-9]{0,7}")


def lane_tag() -> str:
    """The validated tag, or "" when no lane is set (today's behaviour)."""
    raw = os.environ.get(ENV_VAR, "")
    if raw == "":
        return ""
    if not _TAG.fullmatch(raw):
        raise ValueError(f"{ENV_VAR}={raw!r} is not a lane tag: one lowercase letter then up to "
                         "seven lowercase letters/digits (e.g. `a`, `b`); unset it for no lane")
    return raw


def scratch_name(base: str) -> str:
    """`base` unchanged with no lane; `base_<tag>` inside one."""
    tag = lane_tag()
    return f"{base}_{tag}" if tag else base
