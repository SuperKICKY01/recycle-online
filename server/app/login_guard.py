"""Login attempt limiting: the counter, the lockout, and the admin unlock.

WHAT THIS CLOSES. Until this module existed nothing anywhere in the API limited
repeated attempts, login included (OPEN_ITEMS.md, "NOTHING ANYWHERE LIMITS
REPEATED ATTEMPTS"). The finding names the trap to avoid: A KEYSPACE IS NOT A
RATE LIMIT. An 8-character password minimum (D9) and a 31^8 code space (0009)
bound guessing PER attempt and bound NOTHING about the NUMBER of attempts. This
bounds the number.

THE KEY IS (tenant_id, username). To reach a real account a caller MUST submit
that shop's real tenant_id, because RLS resolves the user only under it (login is
ARCHITECTURE 8.2's one by-design exception). So counting failures under
(tenant_id, username) counts exactly the attempts that make progress against a
real account. Not username alone (a stranger could lock an operator from any
network) and not IP alone (a phone changing networks defeats it). The two failure
modes those invite are answered by the lockout AUTO-EXPIRING: a stranger causes
at most a bounded, self-healing outage, and a guesser gets at most
FAILURE_THRESHOLD tries per LOCKOUT_WINDOW per account.

THE LOCKOUT IS DERIVED, NOT STORED. "Locked" is not a column that gets set and
cleared; it is a COUNT over the append-only failed_login_attempts table (migration
0016): the number of `failed` rows for this (tenant_id, username), within the
trailing LOCKOUT_WINDOW, that are newer than the most recent admin unlock marker.
Once those failures age past the window the count falls and the account is usable
again with no action by anyone — which is the "recoverable at 5am with nobody to
call" path. An admin unlock is an APPEND of a marker row, so it too needs no
mutable state and no DELETE.

IT IS A SEPARATE NOTION FROM users.is_active, AND THEY MUST NOT BE CONFLATED.
is_active is the DURABLE admin lock: an admin set it and only POST
/users/{id}/activate clears it (migration 0007). This is the TRANSIENT
failure-driven lock: it sets itself from repeated failures and clears itself with
time (or with an admin unlock). They answer different questions — "may this
account be used at all" versus "has this account seen too many recent failures" —
and both refuse independently and byte-identically; neither masks the other, and
this module never reads or writes is_active.

FAIL CLOSED. The counter store is the same Postgres the login already needs to
resolve a user. If it is unreachable the count RAISES before any credential is
checked, so the login is refused, never waved through. There is no in-memory
fallback that a restart or a second worker could disagree with.

THE RESPONSE DISCLOSES NOTHING. This module never shapes a refusal body — the
caller of is_locked_out raises the same _INVALID_LOGIN as every other refusal, so
a locked account is byte-identical to a wrong password. Disclosing "locked" on an
unauthenticated, soon-internet-facing endpoint would re-open the username-oracle
question that OPEN_ITEMS.md records as the owner's decision, not a fix. The
operator learns the state through the AUTHENTICATED admin unlock route instead.

TWO CHOICES HERE GO BEYOND WHAT THE PHASE ASKED, AND THEY ARE THE REUSABLE PART.
(1) The lock is DERIVED from the append-only record, not STORED as a flag someone
must clear. A stored lock needs an unlock path for the owner's OWN lockout — the
case where the only admin is the one locked out and there is nobody to call — and
a branch that decides whether to clear it can be wrong in the permissive
direction. A derived lock has no such hole: it self-heals as the failures age out
of the window, so the admin unlock route exists only to make a STAFF account
recover FASTER, never as the sole way back in. (2) The locked path still pays a
DUMMY_HASH verify (in app/main.py) before refusing. The brief did not ask for it;
without it a locked account would answer measurably faster than a live account
with a bad password — a timing oracle for "this (tenant, username) is currently
locked". The verify closes it, so every refusal costs exactly one argon2, locked
or not. Neither choice is specific to login: a self-healing derived state and an
equalised refusal cost are the parts worth carrying to the next guard.
"""
from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from .db import tenant_connection
# The GUC-read-back expression every INSERT in this API writes its tenant_id
# with, imported rather than restated for the reason users.py gives about the
# same import: a second spelling of the convention is what drifts at the boundary
# neither author tested. The value written equals the value the RLS WITH CHECK
# tests, so hard rule 2 is structural here rather than remembered.
from .master import _TENANT

# ---------------------------------------------------------------------------
# THE BOUNDS — THE ONE PLACE, and each carries its reason. Not read from the
# environment and not per-tenant: the brief for this phase asks for named
# constants a shop COULD later be allowed to tune, not for the tuning surface
# itself. When that surface is wanted it reads a column and defaults to these;
# building it now would be an unrequested feature.
# ---------------------------------------------------------------------------

# Five failed attempts inside the window lock the account. Chosen against two
# costs at once: high enough that a person fumbling a phone keyboard at a
# weighbridge does not trip it (five wrong in fifteen minutes is well past normal
# mistyping), low enough that it bounds a guesser to ~5 tries per window per
# account — roughly 480 a day — which is astronomically short of brute-forcing
# D9's 8-character minimum. OWASP's default sits in this range for the same
# reasons.
FAILURE_THRESHOLD = 5

# The trailing window the failures are counted over, in seconds (fifteen
# minutes). It doubles as the effective lockout duration: because attempts made
# WHILE locked are not recorded (see migration 0016), the newest counted failure
# ages out of the window LOCKOUT_WINDOW_SECONDS after it happened, and the lock
# clears then. Short enough that an operator locked out with nobody to call is
# back in a quarter of an hour rather than dead until the provider is reached;
# long enough that sustained guessing is throttled to a crawl.
LOCKOUT_WINDOW_SECONDS = 15 * 60

# The two outcome values, mirroring ck_failed_login_outcome in migration 0016.
# Named here so the route code never spells a bare string that could drift from
# the CHECK; a value the CHECK does not admit is a 500 from Postgres, not a quiet
# mis-count.
OUTCOME_FAILED = "failed"
OUTCOME_ADMIN_RESET = "unlocked_by_admin"


# The count a lockout is derived from: `failed` rows for this username, within the
# trailing window, that are NEWER than the most recent admin unlock marker.
#
# NO hand-written `WHERE tenant_id`, deliberately, the doctrine users.py and
# master.py state repeatedly (hard rule 2): the RLS policy injects
# `tenant_id = <GUC>` into every read on this table, so this count is already
# scoped to the connection's tenant — the SUBMITTED tenant during a login, the
# admin's TOKEN tenant during an unlock. A hand-typed predicate here is the one
# that could be wrong.
_COUNT_SQL = text(
    "SELECT count(*) FROM failed_login_attempts"
    " WHERE username = :u"
    "   AND outcome = :failed"
    "   AND created_at >= now() - (:secs * interval '1 second')"
    "   AND created_at > COALESCE("
    "         (SELECT max(created_at) FROM failed_login_attempts"
    "          WHERE username = :u AND outcome = :reset),"
    "         '-infinity'::timestamptz)"
)

_INSERT_SQL = text(
    "INSERT INTO failed_login_attempts (tenant_id, username, outcome)"
    f" VALUES ({_TENANT}, :u, :outcome)"
)


async def recent_failure_count(conn: AsyncConnection, username: str) -> int:
    """How many failures count against this username right now, under conn's tenant.

    Used both to DECIDE a lockout (compared to FAILURE_THRESHOLD) and to REPORT
    the state to an admin on the unlock route.
    """
    return (
        await conn.execute(
            _COUNT_SQL,
            {
                "u": username,
                "failed": OUTCOME_FAILED,
                "reset": OUTCOME_ADMIN_RESET,
                "secs": LOCKOUT_WINDOW_SECONDS,
            },
        )
    ).scalar_one()


async def is_locked_out(conn: AsyncConnection, username: str) -> bool:
    """True if this username has reached the threshold under conn's tenant context."""
    count = await recent_failure_count(conn, username)
    return count >= FAILURE_THRESHOLD


async def record_failed_attempt(tenant_id: uuid.UUID, username: str) -> None:
    """Append one `failed` row, in its OWN committed transaction.

    SEPARATE from the login's read connection ON PURPOSE. tenant_connection wraps
    conn.begin(), so an INSERT issued in the same block as the 401 raise would
    roll back WITH the raise and the counter would never move — which is exactly
    the disproof prove_login_guard.py performs by deleting this call. This block
    returns normally, so it commits, and the login handler raises AFTER it.

    It opens under the SUBMITTED tenant (the same one the login used), and writes
    tenant_id = the GUC read back (_TENANT), so the row lands in the tenant the
    RLS policy will test it against.
    """
    async with tenant_connection(tenant_id) as conn:
        await conn.execute(_INSERT_SQL, {"u": username, "outcome": OUTCOME_FAILED})


async def clear_lockout(conn: AsyncConnection, username: str) -> None:
    """Append one admin-unlock marker, on the caller's EXISTING connection.

    The admin unlock route already holds a tenant_connection under the admin's
    TOKEN tenant and returns 200 normally, so this INSERT commits with it. An
    append, never a DELETE: the count query above ignores every `failed` row at or
    before this marker, so the lockout is cleared without mutable state and without
    the DELETE privilege the app role does not hold.
    """
    await conn.execute(_INSERT_SQL, {"u": username, "outcome": OUTCOME_ADMIN_RESET})
