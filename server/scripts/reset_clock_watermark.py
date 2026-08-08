"""Clear a tripped clock guard. OWNER role only, and deliberately awkward.

WHY THIS IS A SEPARATE SCRIPT AND NOT A RESTART
-----------------------------------------------
A guard that a restart clears is not a guard. The trip lives in the database, so
it survives every restart, and clearing it is an act someone has to choose.

WHY IT RUNS AS THE OWNER ROLE
-----------------------------
The app advances the watermark with GREATEST(highest_seen, now()) and can never
lower it. Lowering is exactly what clearing a trip means, so it must come from a
credential the app does not hold. Migration 0008 REVOKEs INSERT and DELETE from
recycle_app for the same reason.

THE TWO CASES THIS EXISTS FOR
-----------------------------
1. A genuine disaster-recovery restore. The clock is right, the watermark came
   from a future the data no longer remembers, and the trip is correct but
   unwanted.
2. The poisoned watermark. A forward clock error was observed once and recorded,
   so the watermark is high forever and every honest startup now trips.

Both are cleared the same way, on purpose: there is one path, it is recorded in
reset_at / reset_reason, and the reason is not optional.

WHAT THIS SCRIPT CANNOT TELL YOU
--------------------------------
Whether the clock is actually right NOW. It sets the watermark to this server's
current now(), so running it under a wrong clock re-seeds a wrong watermark and
the guard will certify the error. Check the clock against something outside this
machine before running it. Nothing here can do that for you.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def main() -> int:
    ap = argparse.ArgumentParser(
        description="Reset the server clock watermark (owner role).")
    ap.add_argument("--reason", required=True,
                    help="Why this is being cleared. Recorded in the row.")
    ap.add_argument("--yes-the-clock-is-verified-correct", action="store_true",
                    help="Required. Asserts you checked the clock against a "
                         "source outside this machine.")
    ap.add_argument("--database", default=None,
                    help="Override the database name in MIGRATION_DATABASE_URL.")
    args = ap.parse_args()

    if not args.yes_the_clock_is_verified_correct:
        print("REFUSED: --yes-the-clock-is-verified-correct is required.")
        print("  Setting the watermark to a wrong now() re-seeds the error.")
        return 2

    url = os.environ.get("MIGRATION_DATABASE_URL")
    if not url:
        print("REFUSED: MIGRATION_DATABASE_URL is not set. This runs as the"
              " OWNER role by design; the app role cannot lower the watermark.")
        return 2
    if args.database:
        url = url.rsplit("/", 1)[0] + "/" + args.database

    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            before = (await conn.execute(text(
                "SELECT highest_seen FROM server_clock_watermark"))).scalar_one()
            row = (await conn.execute(
                text(
                    "UPDATE server_clock_watermark"
                    "   SET highest_seen = now(),"
                    "       reset_at     = now(),"
                    "       reset_reason = :r"
                    " RETURNING highest_seen, reset_at"
                ),
                {"r": args.reason},
            )).mappings().one()
        print("CLOCK WATERMARK RESET")
        print(f"  was      : {before.isoformat()}")
        print(f"  now      : {row['highest_seen'].isoformat()}")
        print(f"  reset_at : {row['reset_at'].isoformat()}")
        print(f"  reason   : {args.reason}")
        print("  The guard clears on its next tick; no restart is needed.")
        return 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
