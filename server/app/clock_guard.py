"""The server's own clock, disbelieved.

Everything else in this system distrusts the DEVICE clock (hard rule 7). This
module is the only thing that distrusts now(). See migration 0008 for why the
damage is a numbering gap and not a mis-stamped row.

WHAT THIS CATCHES: now() BELOW the highest instant this server has ever seen, by
more than TOLERANCE. That is a clock moving backwards - a container started
before time sync, or NTP stepping a fast clock back.

WHAT IT DOES NOT CATCH, stated here and not only in the migration:
  * a clock wrong FORWARD from a fresh install - there is nothing to compare to;
  * a coherent rollback that takes the clock and the watermark back together,
    because then the two agree;
  * anything at all if the watermark was seeded from an already-wrong clock.

TOLERANCE IS DELIBERATELY ENORMOUS. The irreversible damage needs an error big
enough to cross a Buddhist year boundary - months. A legitimate NTP step is
seconds. 24 hours sits far above the legitimate case and far below the hazard,
and it is also far above any transaction or lock-wait interaction, so the
non-monotonicity of server_received_at (reconcile.py, "WHETHER doc_no ORDER
MATCHES ARRIVAL ORDER") can never reach it.

THE ADVANCE IS FORWARD-ONLY IN SQL, NOT IN PYTHON. GREATEST(highest_seen, now())
means no code path here can lower the watermark even by mistake. Lowering is the
operator reset, which runs as the OWNER role and which the app role's grants
forbid outright (0008 REVOKEs INSERT and DELETE; UPDATE remains, and GREATEST is
what makes UPDATE safe).
"""
from __future__ import annotations

import asyncio
import datetime as dt
import logging
import os
from dataclasses import dataclass, field

from sqlalchemy import text

from .db import tenant_connection

log = logging.getLogger("clock_guard")

TOLERANCE = dt.timedelta(hours=24)

# Seconds between ticks. Env-settable ONLY so the proof can drive it fast; the
# default is what runs in production.
TICK_SECONDS = float(os.environ.get("CLOCK_GUARD_TICK_SECONDS", "60"))

TRIPPED_DETAIL = "server clock is behind the highest instant this server has observed"


@dataclass
class ClockState:
    """Live state. `tripped` is the only thing the request path reads."""

    tripped: bool = False
    # FAIL CLOSED. False until an evaluation has actually SUCCEEDED once. The
    # first version of this file defaulted tripped=False and left it untouched
    # when evaluation raised, so a guard that had never once read the clock
    # answered /health with {"status":"ok"} — observed at 2026-08-08 with a
    # broken interval cast. A guard that cannot see is not a guard that agrees.
    has_evaluated: bool = False
    reason: str | None = None
    observed_now: dt.datetime | None = None
    watermark: dt.datetime | None = None
    behind_by_seconds: float | None = None
    checked_at: dt.datetime | None = None
    consecutive_failures: int = 0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def should_refuse(self) -> bool:
        """The single authority on whether to serve. Fail closed on all three.

        Refuses when the clock is behind, when the guard has never managed to
        read it, and when the most recent read failed — because in the last two
        cases the answer is UNKNOWN, and serving on an unknown clock is the
        thing this module exists to prevent.
        """
        return self.tripped or not self.has_evaluated or self.consecutive_failures > 0

    def refusal_status(self) -> str:
        if self.tripped:
            return "clock_guard_tripped"
        if not self.has_evaluated:
            return "clock_guard_never_evaluated"
        return "clock_guard_stale"

    def as_dict(self) -> dict:
        """Machine-readable, for /health. Every field a caller might branch on."""
        return {
            "tripped": self.tripped,
            "has_evaluated": self.has_evaluated,
            "consecutive_failures": self.consecutive_failures,
            "reason": self.reason,
            "observed_now": self.observed_now.isoformat() if self.observed_now else None,
            "watermark": self.watermark.isoformat() if self.watermark else None,
            "behind_by_seconds": self.behind_by_seconds,
            "tolerance_seconds": TOLERANCE.total_seconds(),
            "checked_at": self.checked_at.isoformat() if self.checked_at else None,
        }


STATE = ClockState()


async def evaluate(state: ClockState = STATE) -> ClockState:
    """One evaluation. Reads now() and the watermark IN THE SAME STATEMENT.

    Same statement, so the two values are the same transaction snapshot and no
    second read can drift between them - the ordering lesson bills.py already
    carries, applied here.

    No tenant context: the watermark is server state, outside RLS (0008).
    tenant_connection(None) is the documented way to open a transaction with no
    context, and it is what the request path uses when it has no tenant.
    """
    async with state._lock:
        try:
            async with tenant_connection(None) as conn:
                row = (
                    await conn.execute(
                        # make_interval(secs => ...) and not a bound timedelta:
                        # asyncpg could not resolve `highest_seen - :tol` and
                        # raised "operator does not exist: timestamp with time
                        # zone < interval". Seconds as a float is unambiguous.
                        text(
                            "SELECT now() AS observed,"
                            "       highest_seen,"
                            "       now() < highest_seen"
                            "             - make_interval(secs => :tol) AS behind"
                            "  FROM server_clock_watermark"
                        ),
                        {"tol": TOLERANCE.total_seconds()},
                    )
                ).mappings().one()

                observed: dt.datetime = row["observed"]
                watermark: dt.datetime = row["highest_seen"]
                behind: bool = row["behind"]

                if not behind:
                    # FORWARD ONLY. GREATEST is the whole safety property here.
                    await conn.execute(
                        text(
                            "UPDATE server_clock_watermark"
                            " SET highest_seen = GREATEST(highest_seen, now())"
                        )
                    )

            state.observed_now = observed
            state.watermark = watermark
            state.checked_at = observed
            state.behind_by_seconds = (watermark - observed).total_seconds()
            state.consecutive_failures = 0
            state.has_evaluated = True

            if behind:
                if not state.tripped:
                    # Loud, once per transition. The alerting channel is a
                    # separate decision; a log line is this phase's scope.
                    log.error(
                        "CLOCK GUARD TRIPPED: now()=%s is %.0fs behind watermark=%s"
                        " (tolerance %.0fs). Refusing to serve. This is what a"
                        " container starting before time sync looks like. If this"
                        " is a disaster-recovery restore, clear it deliberately"
                        " with scripts/reset_clock_watermark.py as the OWNER role.",
                        observed.isoformat(),
                        state.behind_by_seconds,
                        watermark.isoformat(),
                        TOLERANCE.total_seconds(),
                    )
                state.tripped = True
                state.reason = TRIPPED_DETAIL
            else:
                if state.tripped:
                    log.warning(
                        "CLOCK GUARD CLEARED without a restart: now()=%s is no"
                        " longer behind watermark=%s.",
                        observed.isoformat(),
                        watermark.isoformat(),
                    )
                state.tripped = False
                state.reason = None

        except asyncio.CancelledError:
            # Never swallow cancellation - that is how a shutdown hangs.
            raise
        except Exception as exc:  # noqa: BLE001
            # A database that cannot be read is NOT a tripped clock, and must not
            # be reported as one: that would send the operator to the wrong
            # cause. Leave `tripped` as it was and say what actually happened.
            state.consecutive_failures += 1
            log.error(
                "CLOCK GUARD COULD NOT EVALUATE (%s failure(s) in a row): %r."
                " tripped=%s is UNCHANGED and is stale, not fresh.",
                state.consecutive_failures, exc, state.tripped,
            )

        return state


async def tick_forever(state: ClockState = STATE) -> None:
    """The periodic re-evaluation.

    This is what makes /health-503 the right choice over exiting the process: a
    container that started before time sync corrects itself within seconds, and
    a live process notices. A dead one cannot.
    """
    while True:
        try:
            await asyncio.sleep(TICK_SECONDS)
            await evaluate(state)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            # The loop must outlive any single failure. A guard whose task died
            # silently reports the last thing it ever saw, forever.
            log.error("CLOCK GUARD TICK failed, loop continues: %r", exc)
