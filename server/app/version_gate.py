"""The API version contract: refuse a client too old to speak this API.

WHY THIS EXISTS, and why BEFORE the first installable build (P1.11). Once a
release build is on a shop's phone, the shop controls when — or whether — it
updates. The moment the API changes meaning, an un-updated client is talking to
a server that no longer means what it used to, and the failure is SILENT: a bill
that saves but means something else. This gate is the one place that turns that
silent divergence into a loud, single-instruction refusal the moment it could
begin. It cannot be retrofitted onto handsets already in the field, so it is
built before any of them exist. OPEN_ITEMS.md recorded the gap it closes:
"THERE IS NO API VERSION, SO ONE CONTRACT CHANGE BREAKS EVERY HANDSET THAT HAS
NOT BEEN UPDATED."

WHAT A VERSION NUMBER MEANS HERE, and it is NOT semver theatre. The value a
client sends is a single monotonic INTEGER: the API-contract version the client
was built against. It is NOT the app's marketing version (app.json's "1.0.0",
which moves for reasons that have nothing to do with the wire) and it identifies
NOTHING about a person or a device — it is not analytics. It rises by exactly one
each time the server makes a change to a contract the client depends on that an
OLD client could not survive: a change an un-updated client would MISHANDLE —
save wrong, read wrong, or classify a refusal wrong — rather than fail loudly.

  - A change that WOULD have raised the floor, from this codebase's own history:
    the introduction of the 424 master-data-missing contract (bills.py's
    `_RESOLVABLE_STATUS`, the `seller_grade_unset` / `product_price_unset`
    species). A client built before 424 existed classifies an unknown 4xx as
    `unavailable, reachable: true` — retry-forever plus the poison alarm plus a
    head-of-line block (mobile/src/adapters/httpTransport.ts, the terminal
    `else`) — where the bill should have PARKED. That is a refusal an old client
    silently mishandles, which is exactly the floor's trigger.
  - A change that WOULD NOT: adding `user_id` to the login response (migration
    0007 / P1.7) or adding a whole new route the old client never calls
    (`GET /reports/summary`). An old client ignores the new field and never hits
    the new route, so nothing it does is wrong. Additive-and-ignorable does not
    raise the floor.

THE ANSWER IS THE STATUS, AND THE STATUS ALONE. A refused client is answered
426 (Upgrade Required — HTTP's own name for exactly this), and the client
branches on 426 and nothing else. The body carries structured integers for a
human reading a log or a monitor, never prose the client must parse — the same
discipline every refusal in auth.py (295-326) and bills.py already follows. 426
is a FIFTH axis alongside the four that comment enumerates (422 PERMANENT /
424 RESOLVABLE / 401 IDENTITY / 5xx UNKNOWN) and the 403 beside them: it is about
neither the payload, the master data, the caller's identity, nor the server's
health — it is about the client's BUILD, and the only thing that clears it is an
updated app. 426 collides with no status this API emits today (the in-use set is
200/201/400/401/403/404/409/422/424/503).

FAILING SAFE, AIMED THE OPPOSITE WAY TO JWT_SECRET. config.py's identity secrets
fail CLOSED — absent means refuse, because a default identity is a forged one
(lessons/config-defaults-must-fail-closed). The FLOOR is the opposite kind of
value: it is an AVAILABILITY decision, not an identity one, so its safe direction
is to ADMIT. A floor that cannot be read must never brick the fleet, and a
header-less request (a build that predates this contract — the one on the owner's
handset today) must keep working. Hence: the default floor is 0, an absent or
unparseable header is version 0, and at floor 0 EVERY client is admitted. The
contract is therefore voluntary until the floor is deliberately raised above 0 —
which is a considered act tied to shipping an incompatible server change, and
which nobody has taken. Raising it is a data edit, not a deploy (below).

THE FLOOR IS DATA, NOT A DEPLOY. Raising it must not mean editing code and
restarting, so the VALUE lives in a file read PER REQUEST (mtime-cached), not in
a constant or an import-time env read (an env var of a running process cannot
change without a restart). An operator raises the floor by writing an integer to
the file; the next request sees it. The file's PATH is import-time config,
env-settable only so the proof can point at a scratch file — the same shape and
the same reason as clock_guard.TICK_SECONDS. No database table is needed, so this
adds no migration.
"""
from __future__ import annotations

import os

# The header a client stamps on every request: the integer API-contract version
# it was built against. Lower-case because HTTP header names are case-insensitive
# and Starlette normalises to lower-case; nothing here depends on the casing a
# client chooses to send.
CLIENT_API_VERSION_HEADER = "x-client-api-version"

# The compiled default floor, and the value a request with no usable version
# resolves to. 0 admits everything: the header-less pre-contract build, a
# malformed header, and every real version >= 0. This is the "accept today's
# build" floor, and it is what runs until someone writes a higher number to the
# floor file.
DEFAULT_MIN_CLIENT_API_VERSION = 0
ABSENT_CLIENT_VERSION = 0

# The floor's VALUE lives here, read per request. PATH is import-time config,
# env-settable ONLY so the proof can drive it against a scratch file; the default
# is what runs in production. Absent by design — its absence means DEFAULT above.
_SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLOOR_FILE = os.environ.get(
    "CLIENT_API_VERSION_FLOOR_FILE", os.path.join(_SERVER_DIR, "api_version_floor")
)

# (mtime_ns, size, floor) of the last GOOD read. A changed file (either component
# differs) forces a re-read, so an operator's edit is picked up by the next
# request with no restart. Keyed on both mtime and size so two edits within one
# clock tick cannot be missed.
_floor_cache: tuple[int, int, int] | None = None


# ===========================================================================
# THE FLOOR IS A LOADED GUN UNTIL THE CLIENT CAN CLASSIFY A 426. LEAVE IT AT 0.
#
# Raising the floor above 0 does NOT refuse an outdated fleet politely — it
# WEDGES it. Measured (mobile survey, 2026-09-01): today's app turns an unknown
# 4xx, 426 INCLUDED, into `{kind:"unavailable", reachable:true}` on the bill path
# (`mobile/src/adapters/httpTransport.ts:190-197`), which retries forever, trips
# the poison alarm, and blocks the HEAD of the outbox queue behind it. So a floor
# raised before the CLIENT half ships turns every un-updated handset into a jammed,
# red-alarmed device that cannot send the bill in front of it.
#
# THE CLIENT HALF IS WHAT UNLOCKS RAISING THIS. It gives the app a `client_outdated`
# class that classifies a 426 as "update the app" — calm, no poison, queued bills
# untouched. Until that has shipped AND is on the handsets you are about to cut off,
# WHOEVER RAISES THE FLOOR checks that first. This is not a config knob to turn
# casually; its misuse bricks the fleet.
# ===========================================================================
def current_floor() -> int:
    """The minimum client API version this server accepts, right now.

    Read PER CALL from FLOOR_FILE, mtime-cached. Absent or unparseable -> the
    compiled default, which admits today's build: a floor that cannot be read
    must ADMIT, never refuse (see the module docstring — this is an availability
    value, the opposite direction to an identity secret). A bad read is never
    cached, so fixing the file recovers on the next request without a restart.
    """
    global _floor_cache
    try:
        st = os.stat(FLOOR_FILE)
    except OSError:
        # No file is the normal, default state — the floor is DEFAULT.
        _floor_cache = None
        return DEFAULT_MIN_CLIENT_API_VERSION
    key = (st.st_mtime_ns, st.st_size)
    if _floor_cache is not None and _floor_cache[:2] == key:
        return _floor_cache[2]
    try:
        with open(FLOOR_FILE, "r", encoding="utf-8") as f:
            floor = int(f.read().strip())
    except (OSError, ValueError):
        # A file that exists but cannot be read as an integer must not brick the
        # fleet either. Fall back to the default and do NOT cache the bad read,
        # so a corrected file is honoured immediately.
        return DEFAULT_MIN_CLIENT_API_VERSION
    _floor_cache = (key[0], key[1], floor)
    return floor


def client_version_from(header_value: str | None) -> int:
    """The integer a request identifies itself as, from the raw header.

    Absent, blank, non-integer, or negative all resolve to ABSENT_CLIENT_VERSION
    (0) — the pre-contract cohort. This keeps the "floor 0 admits everything"
    property total: only a floor deliberately raised above 0 refuses anyone, and
    a broken or hostile header cannot be MORE admitted than a real old client, it
    is simply treated as the oldest.
    """
    if header_value is None:
        return ABSENT_CLIENT_VERSION
    try:
        parsed = int(header_value.strip())
    except ValueError:
        return ABSENT_CLIENT_VERSION
    return parsed if parsed > ABSENT_CLIENT_VERSION else ABSENT_CLIENT_VERSION


def too_old(client_version: int, floor: int) -> bool:
    """The whole judgement: a client is too old iff it is below the floor."""
    return client_version < floor


def refusal_payload(client_version: int, floor: int) -> dict:
    """The 426 body: the house {"detail": {kind, code, message, ...}} envelope.

    `kind` is distinct ("client_outdated") so a client that reads the body can
    tell it from every other refusal without the status; but a client is meant to
    branch on the 426 STATUS alone, and the two integer fields exist for a human
    reading a log or a monitor. The message is ENGLISH and is for diagnosis only
    — the yard-facing Thai wording is the client's, exactly as auth.unauthenticated
    and forbidden document for their own refusals.
    """
    return {
        "detail": {
            "kind": "client_outdated",
            "code": "client_api_version_unsupported",
            "message": (
                f"client API version {client_version} is below the minimum "
                f"{floor} this server supports; the app must be updated"
            ),
            "min_client_api_version": floor,
            "client_api_version": client_version,
        },
    }
