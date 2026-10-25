"""The daily money view — one shop day, ADMIN ONLY.

    GET /reports/daily[?date=YYYY-MM-DD][&limit=200&offset=0]

The number an owner balances the cash box against at closing. Until this
endpoint there was psql or nothing, and `GET /bills` — the only listing there is
— filters `voided_at IS NULL`, so every reversal of real money was invisible in
it. An unwatched void is how cash walks out of a yard.

Nothing here is a new business rule. It totals rows that already exist. Every
DECISION it does make is written down below, because each one is a place where a
plausible alternative would produce a wrong number quietly.


1. THE DAY BOUNDARY — server_received_at, converted to shop time
---------------------------------------------------------------
The day is the half-open interval [D 00:00:00 +07, D+1 00:00:00 +07), applied to
`server_received_at`. Never `device_created_at`.

That is not a preference, it is measured. Two phones reconnecting together on
2026-07-29 produced B-2569-224 (Android, device stamp 04:09:19.017) and
B-2569-225 (iPhone, 04:09:18.892): the EARLIER-stamped bill took the HIGHER
number, because doc_no is arrival order and the two stamps come from two clocks
this server does not control. ~3 s of skew has been measured on real hardware
here, and a phone 14 h fast has been seen (lessons/doc-no-is-arrival-order-not-
event-time.md, lessons/a-stored-future-instant-is-a-promise-about-a-clock.md).
Totalling on a device clock means a bill weighed at 23:59:58 by a phone running
three seconds fast falls in yesterday on the phone and today on the server — two
"correct" reports that do not reconcile, and a day's cash counted twice or not
at all.

THE CONSEQUENCE THE OWNER MUST BE TOLD, not left to discover:

    A BILL WEIGHED AT 23:50 AND SYNCED AT 00:05 COUNTS IN THE NEXT DAY.

It is stated in the response itself (`basis.consequence_th`), not only here,
because a report is read by someone who never opens this file. The trade is
deliberate: the alternative counts a load on the day a phone THINKS it was
weighed, and the phone is the one clock in the system nobody can audit.

Mechanically: the window is computed in PYTHON from SHOP_TIMEZONE and passed as
two UTC instants, so the predicate is a plain range on a bare column. It is NOT
`WHERE (server_received_at AT TIME ZONE 'Asia/Bangkok')::date = :d`, for two
reasons — that hides the column inside a function (no index can ever serve it),
and it makes Postgres's IANA database a SECOND timezone authority next to
config.SHOP_TIMEZONE, which is the one thing config.py forbids.

2. WHO DECIDES "TODAY" — the server, from the DATABASE clock
------------------------------------------------------------
With no `date` parameter the day is the shop-time date of `now()`, read inside
this request's transaction. `now()` and not the app process's clock, because
`now()` is the exact function that stamps `server_received_at` — so the day
boundary and the rows it filters come from ONE clock even if the API and the
database ever run on different machines.

A client MAY name a day, because "what did we take on Saturday" is a real
question. A wrong device clock is stopped from silently producing the wrong
day's total by three things together:

  - the client never has to compute a date. Omitting the parameter is the normal
    case and is answered entirely from the server's clock.
  - a date in the FUTURE of the server's shop day is REFUSED (422
    `day_in_the_future`). This is the one wrong-clock case that returns a
    believable answer: a phone running fast asks for tomorrow and gets
    `active_bill_count: 0, active_total: "0.00"`, which reads as "no business
    today", not as an error. Refusing turns a plausible zero into a visible
    failure. (A SLOW clock asks for a real past day and gets that day's real
    total — wrong, but the response says which day it is, so it is not silent.)
  - every response carries `day.date`, `day.date_be`, `day.is_today`,
    `day.requested` and `day.server_now`. The day is always labelled, and the
    server's own clock travels beside it, so a client can compute its own skew
    with no extra parameter and a UI can say plainly that it is not showing
    today.

3. OFF-LIST PAYMENTS — the comparison the schema was shaped for
---------------------------------------------------------------
Hard rule 6 stores `unit_price` AND `list_price` on every line, and since phase
2c-6 the SERVER stamps list_price from the tenant's own price list at the
seller's grade — precisely so an audit can see what was paid against what the
list said. Nothing surfaced that comparison anywhere until now.

A bill is `off_list` when at least one of its lines has
`unit_price <> list_price`. Exact NUMERIC comparison, no tolerance. The day also
carries `off_list_variance`: what was actually paid minus what the list would
have cost, over the day's ACTIVE bills, in baht. Positive means the yard paid
above list. The list-equivalent is rounded per line with `round(net * list, 2)`,
the same HALF-UP-per-line arithmetic `bills._line_amount` uses, so the two sides
are comparable line for line rather than only in aggregate.

This does not accuse anyone. Paying off list is legitimate every day — a
negotiated load, a stale price. It is only that nobody could SEE it.

4. WHO MAY SEE IT — admin only, and the honest limit of that
------------------------------------------------------------
`require_admin`. The day's takings, the void list and the off-list signal are
the owner's numbers:

  - the void detail (who voided, why, when) is oversight of the people who can
    void. It should not travel on every handset in the yard — phones get lost,
    shared, and handed to the next hire.
  - the off-list flag is the audit signal about whether someone paid over list.
    There is no reason to show the watched party exactly what the watcher sees.
  - it matches the model already in place: staff create bills and read master
    data; every oversight or shop-wide capability (voids, master-data writes) is
    already admin-only. This would otherwise be the first aggregate on a yard
    phone.
  - the asymmetry decides it. If the owner wants a supervisor to see this, that
    is one role change. If it is open by default, every phone in the shop shows
    the day's cash and there is no way to take it back.

WHAT ADMIN-ONLY HERE IS NOT: a confidentiality boundary around the day's total.
A staff token can already call `GET /bills` (tenant-wide, up to 200 bills with
their totals) and `GET /bills/{id}` (which returns unit_price AND list_price),
so a determined staff phone can compute both the day's takings and the off-list
lines today, without this endpoint. This gate is defence in depth and a
deliberate choice not to add a second, easier door. Whether `GET /bills` should
be tenant-wide for staff at all is a real question and it is the OWNER's to
answer — it is recorded in PROJECT_STATUS.md, not quietly changed here.

5. WHAT THIS ENDPOINT CANNOT KNOW — say it, do not paper over it
----------------------------------------------------------------
THE SERVER CANNOT COUNT BILLS STILL SITTING UNSYNCED ON A PHONE. The whole
mobile design is local-first: a bill is real on the device the moment it is
saved, and reaches here only when the network allows. So this total can be
understated at any moment, INCLUDING AT CLOSING TIME, and the shortfall is
exactly the bills the owner most needs — the last loads of the day, taken when
the yard is busiest.

The response therefore carries `completeness.understatement_possible`, and it is
a CONSTANT `true`. Not a computed field: there is no device registry, no
heartbeat, and `purchase_bills` has no device column, so the server has no
evidence with which to ever say otherwise. A field that computed `false` would
be inventing a guarantee. `completeness.cannot_know` spells out each blind spot
in words a non-engineer can act on.

`completeness.quiet_for_seconds` (today only) is the nearest thing to a signal —
how long since anything arrived. It is NOT a sync check and is labelled as such:
a quiet hour is an idle yard and a disconnected phone at the same time, and
nothing here can tell them apart.

What would fix it is device check-in (a devices table, a last-seen stamp, a
count of locally-pending bills reported by each phone). That needs a migration
and a device identity, and it is NOT built here. Until it exists, the report
tells the truth about its own edges instead of implying it has none.

6. SIZE — a busy day is hundreds of bills
------------------------------------------
THE MONEY IS NEVER PAGED. Every total, count, doc_no range and the off-list
figures are SQL aggregates over the whole day, computed independently of the
line list. A truncated list can therefore never produce a short total — the
failure mode where an owner balances against a partial sum cannot occur, by
construction rather than by care.

The per-bill LINES are paged: `limit` (default 200, max 500) and `offset`, with
`bills.total`, `bills.truncated` and `bills.next_offset` in the response.

The VOID list is not paged, deliberately: truncating the fraud-surveillance list
is exactly the wrong thing to truncate, and voids are rare by nature. It carries
a hard cap of 500 with a `truncated` flag purely so the response cannot become
unbounded; a day that hits it is itself the finding.

SNAPSHOT. The whole report runs in ONE repeatable-read transaction, so the
aggregates and the lines are the same instant. Under READ COMMITTED a bill
committing between two statements is in one and not the other, and the owner
gets a total that does not equal the list beneath it.

INDEX — NOT ADDED, ON PURPOSE. The day predicate is
`(tenant_id, server_received_at)` and there is no index on it; migration 0001
gives purchase_bills only `(tenant_id, id)` and `(tenant_id, doc_no)`. At one
shop's volume this is a sequential scan over a small table and is fine. It stops
being fine after a year or two of real trade. The fix is a migration adding
`ix_bills_tenant_received ON purchase_bills (tenant_id, server_received_at)`;
this phase stops here rather than adding one. Nothing else in this file needs a
schema change.

Money is returned as STRINGS, everywhere, including zero. Serialising NUMERIC
through a JSON float is exactly the drift this project forbids.

Timestamps in this response are ISO-8601 in the SHOP's offset (`+07:00`), not
UTC. Deliberately different from GET /bills, which returns UTC and leaves
formatting to the client: this endpoint's entire subject is the shop day, and
`day.starts_at` reading `00:00:00+07:00` is the clearest possible statement of
where the boundary is. The offset is IN the string, so no instant is lost — and
it makes the failure from lessons/render-in-shop-time-not-device-time.md benign:
a client that naively slices the string gets the SHOP clock, not UTC.
"""
from __future__ import annotations

import datetime as dt
import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from .auth import Principal, get_principal, permission_required, require
from .permissions import Permission
from .bills import _be_year
from .config import SHOP_TIMEZONE, SHOP_TIMEZONE_NAME
from .db import tenant_connection

router = APIRouter()

# Line paging. The money aggregates ignore both of these entirely.
_DEFAULT_LINE_LIMIT = 200
_MAX_LINE_LIMIT = 500

# A ceiling on the void lists so the response cannot grow without bound. Not
# paging — see the module docstring. A day that reaches it is a finding.
_VOID_CAP = 500

_ZERO = Decimal("0.00")


def _invalid(code: str, message: str, **context: Any) -> HTTPException:
    """Same shape as master._invalid — one refusal vocabulary across the API."""
    return HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"kind": "invalid_request", "code": code, "message": message, **context},
    )


def _money(value: Any) -> str:
    """A NUMERIC as an exact decimal STRING, always two places.

    Decimal in, string out, no float anywhere on the path. quantize normalises
    the aggregate cases: SUM over no rows coalesces to `0`, which would otherwise
    serialise as "0" and read as a different kind of number than "0.00".
    """
    return str(Decimal(value or 0).quantize(_ZERO, rounding=ROUND_HALF_UP))


def _shop_iso(instant: dt.datetime | None) -> str | None:
    """An instant rendered in the SHOP's offset. One conversion, one place."""
    if instant is None:
        return None
    return instant.astimezone(SHOP_TIMEZONE).isoformat()


def _shop_date_of(instant: dt.datetime) -> dt.date:
    """Which SHOP day an instant falls in. Never the server's local date."""
    return instant.astimezone(SHOP_TIMEZONE).date()


def _day_window(day: dt.date) -> tuple[dt.datetime, dt.datetime]:
    """The half-open UTC interval covering one shop day.

    HALF-OPEN IS THE WHOLE POINT. `>= start AND < end` means the instant
    00:00:00.000 belongs to exactly one day — the one starting at it. A closed
    interval (`<= end`) would count a bill landing on the stroke of midnight in
    BOTH days, and a day's takings would be counted twice for that bill.
    """
    start = dt.datetime.combine(day, dt.time.min, tzinfo=SHOP_TIMEZONE)
    end = dt.datetime.combine(day + dt.timedelta(days=1), dt.time.min, tzinfo=SHOP_TIMEZONE)
    return start.astimezone(dt.timezone.utc), end.astimezone(dt.timezone.utc)


def _be_date_label(day_start_utc: dt.datetime, day: dt.date) -> str:
    """DD/MM/BBBB — the Buddhist-era date, for a human.

    The year comes from bills._be_year, the SAME function doc_no uses, rather
    than a second `+ 543` written here. Two derivations are two behaviours, and
    they drift at exactly the boundary neither author tested
    (lessons/be-year-comes-after-the-timezone.md). Because they share one source
    a report's year and the doc_no year on the bills it lists cannot disagree.

    NOT ISO-shaped (2569-07-29): that form invites being parsed as Gregorian.
    """
    return f"{day.day:02d}/{day.month:02d}/{_be_year(day_start_utc)}"


# ---------------------------------------------------------------------------
# The queries. Not one hand-written `WHERE tenant_id` in this file: every one
# runs inside tenant_connection(principal.tenant_id), so RLS scopes it. Another
# shop's day is not forbidden here, it is INVISIBLE — the same property that
# makes a cross-tenant id a plain 404 in master.py.
#
# doc_no is text (`B-2569-224`), so its range CANNOT be min()/max() on the
# string: lexically "B-2569-99" > "B-2569-100", and a shop crosses that boundary
# on its 100th bill of the year. The sequence is parsed out and ordered
# numerically, on (be_year, seq) rather than seq alone, because a bill whose
# transaction starts a hair before shop midnight on new year's eve can take its
# counter a hair after it — rare, but ordering by seq alone would then be
# nonsense rather than merely unusual.
# ---------------------------------------------------------------------------

_SUMMARY_SQL = """
WITH day_bills AS (
    SELECT total_amount, voided_at, server_received_at, doc_no,
           NULLIF(split_part(doc_no, '-', 1), '')      AS doc_prefix,
           NULLIF(split_part(doc_no, '-', 2), '')::int AS doc_be,
           NULLIF(split_part(doc_no, '-', 3), '')::int AS doc_seq
      FROM purchase_bills
     WHERE server_received_at >= :start AND server_received_at < :end
)
SELECT
    count(DISTINCT doc_prefix)                                          AS prefix_count,
    count(*)                                                            AS bill_count,
    count(*) FILTER (WHERE voided_at IS NULL)                           AS active_count,
    count(*) FILTER (WHERE voided_at IS NOT NULL)                       AS voided_count,
    coalesce(sum(total_amount) FILTER (WHERE voided_at IS NULL), 0)     AS active_total,
    coalesce(sum(total_amount) FILTER (WHERE voided_at IS NOT NULL), 0) AS voided_total,
    min(server_received_at)                                             AS first_received_at,
    max(server_received_at)                                             AS last_received_at,
    (array_agg(doc_no ORDER BY doc_be, doc_seq)
        FILTER (WHERE doc_no IS NOT NULL))[1]                           AS first_doc_no,
    (array_agg(doc_no ORDER BY doc_be DESC, doc_seq DESC)
        FILTER (WHERE doc_no IS NOT NULL))[1]                           AS last_doc_no,
    min(doc_be)                                                         AS min_be,
    max(doc_be)                                                         AS max_be,
    min(doc_seq)                                                        AS min_seq,
    max(doc_seq)                                                        AS max_seq,
    count(*) FILTER (WHERE doc_no IS NULL)                              AS undocumented_count
  FROM day_bills
"""

# Off-list, over the day's ACTIVE bills only. A voided bill's pricing is not a
# payment — including it would report money that was reversed as money paid
# above list.
_OFF_LIST_SQL = """
WITH per_bill AS (
    SELECT b.id,
           count(*) FILTER (WHERE i.unit_price <> i.list_price)  AS off_lines,
           coalesce(sum(i.amount), 0)                            AS paid_total,
           coalesce(sum(public.line_amount_rounded(coalesce(i.quantity, i.net_weight), i.list_price,
                                                   coalesce(i.rounding_rule, 'half_up_0.01'))), 0) AS list_total
      FROM purchase_bills b
      JOIN purchase_bill_items i ON i.bill_id = b.id
     WHERE b.voided_at IS NULL
       AND b.server_received_at >= :start AND b.server_received_at < :end
     GROUP BY b.id
)
SELECT count(*) FILTER (WHERE off_lines > 0)      AS off_list_bill_count,
       coalesce(sum(off_lines), 0)                AS off_list_line_count,
       coalesce(sum(paid_total - list_total), 0)  AS off_list_variance
  FROM per_bill
"""

# The human-readable lines. LEFT JOIN on sellers with NO is_active predicate,
# for the reason bills._read_bill spells out: a retired seller must still appear
# on the day they sold, and a money line must never be lost to make a name
# resolve. INNER would silently drop the bill and leave the day's total
# disagreeing with its own list.
_LINES_SQL = """
SELECT b.id, b.doc_no, b.total_amount, b.server_received_at, b.vehicle_no,
       s.code AS seller_code, s.name AS seller_name,
       agg.item_count, agg.off_list_lines
  FROM purchase_bills b
  LEFT JOIN sellers s ON s.id = b.seller_id
  JOIN LATERAL (
        SELECT count(*)                                           AS item_count,
               count(*) FILTER (WHERE i.unit_price <> i.list_price) AS off_list_lines
          FROM purchase_bill_items i
         WHERE i.bill_id = b.id
       ) agg ON true
 WHERE b.voided_at IS NULL
   AND b.server_received_at >= :start AND b.server_received_at < :end
 ORDER BY b.server_received_at, b.id
 LIMIT :limit OFFSET :offset
"""

# Two DIFFERENT void questions, and a day view that answers only the first has a
# hole an owner cannot see:
#
#   _VOIDED_SQL       — bills RECEIVED this day that are now void. The
#                       reconciliation set: their doc_nos sit inside this day's
#                       range but their money is not in this day's total, and
#                       that is the difference an owner must be able to explain.
#
#   _VOIDS_APPLIED_SQL— voids PERFORMED during this day, whatever day the bill
#                       belongs to. The surveillance set. Without it, a bill from
#                       last Tuesday voided today appears in NO day anyone opens:
#                       not today's (it was not received today) and not
#                       Tuesday's, because nobody reopens a closed day. That is
#                       the unwatched void, and it is the one that costs money.
_VOIDED_SQL = """
SELECT b.id, b.doc_no, b.total_amount, b.void_reason, b.voided_at, b.voided_by,
       b.server_received_at, u.username AS voided_by_username,
       u.full_name AS voided_by_name, s.name AS seller_name
  FROM purchase_bills b
  LEFT JOIN users   u ON u.id = b.voided_by
  LEFT JOIN sellers s ON s.id = b.seller_id
 WHERE b.voided_at IS NOT NULL
   AND b.server_received_at >= :start AND b.server_received_at < :end
 ORDER BY b.voided_at
 LIMIT :cap
"""

_VOIDS_APPLIED_SQL = """
SELECT b.id, b.doc_no, b.total_amount, b.void_reason, b.voided_at, b.voided_by,
       b.server_received_at, u.username AS voided_by_username,
       u.full_name AS voided_by_name, s.name AS seller_name
  FROM purchase_bills b
  LEFT JOIN users   u ON u.id = b.voided_by
  LEFT JOIN sellers s ON s.id = b.seller_id
 WHERE b.voided_at >= :start AND b.voided_at < :end
 ORDER BY b.voided_at
 LIMIT :cap
"""


def _void_payload(r: Any, day: dt.date) -> dict:
    bill_day = _shop_date_of(r["server_received_at"])
    return {
        "id": str(r["id"]),
        "doc_no": r["doc_no"],
        # The bill's own recorded total. It is NOT part of active_total.
        "total_amount": _money(r["total_amount"]),
        "seller_name": r["seller_name"],
        "reason": r["void_reason"],
        "voided_by": str(r["voided_by"]) if r["voided_by"] else None,
        "voided_by_username": r["voided_by_username"],
        "voided_by_name": r["voided_by_name"],
        "voided_at": _shop_iso(r["voided_at"]),
        "received_at": _shop_iso(r["server_received_at"]),
        # Which shop day the BILL belongs to. Equal to the report's day in the
        # `voided` list by construction; in `voids_applied` it is the flag that
        # makes a back-dated void stand out instead of blending in.
        "bill_date": bill_day.isoformat(),
        "from_earlier_day": bill_day != day,
    }


@router.get("/reports/daily")
async def daily_report(
    date: dt.date | None = Query(
        None,
        description=(
            "Shop-local calendar date (YYYY-MM-DD). Omit for today, decided by"
            " the SERVER's clock. A future date is refused — see"
            " day_in_the_future."
        ),
    ),
    limit: int = Query(_DEFAULT_LINE_LIMIT, ge=1, le=_MAX_LINE_LIMIT),
    offset: int = Query(0, ge=0),
    # money.view_shop (0019; was require_admin) — see section 4 of the module
    # docstring. The shop's day belongs to whoever the shop lets see its money.
    principal: Principal = Depends(require(Permission.MONEY_VIEW_SHOP)),
) -> dict:
    async with tenant_connection(
        principal.tenant_id, isolation_level="REPEATABLE READ"
    ) as conn:
        # The snapshot instant. now() is transaction-start under repeatable read,
        # so this IS the moment every number below is true of — and it is the
        # same function that stamps server_received_at on an arriving bill.
        as_of: dt.datetime = (await conn.execute(text("SELECT now()"))).scalar_one()
        today = _shop_date_of(as_of)

        requested = date is not None
        day = date if date is not None else today
        if day > today:
            # The only wrong-clock case that returns a believable answer. See
            # section 2: a fast phone asking for tomorrow would otherwise be told
            # the shop took nothing.
            raise _invalid(
                "day_in_the_future",
                "ยังไม่ถึงวันที่ขอ จึงยังไม่มียอดของวันนั้น",
                requested_date=day.isoformat(),
                shop_today=today.isoformat(),
                shop_timezone=SHOP_TIMEZONE_NAME,
            )

        start, end = _day_window(day)
        window = {"start": start, "end": end}

        summary = (await conn.execute(text(_SUMMARY_SQL), window)).mappings().one()
        off_list = (await conn.execute(text(_OFF_LIST_SQL), window)).mappings().one()
        lines = (
            await conn.execute(
                text(_LINES_SQL), {**window, "limit": limit, "offset": offset}
            )
        ).mappings().all()
        voided = (
            await conn.execute(text(_VOIDED_SQL), {**window, "cap": _VOID_CAP})
        ).mappings().all()
        voids_applied = (
            await conn.execute(text(_VOIDS_APPLIED_SQL), {**window, "cap": _VOID_CAP})
        ).mappings().all()

    # ---- doc_no range -----------------------------------------------------
    # `span` is how many document numbers the range covers; `bill_count` is how
    # many bills this day actually holds. Equal is the normal, healthy case.
    # Unequal means a number issued inside this range is not in this day — which
    # happens legitimately when a bill's transaction straddles shop midnight, and
    # is ALSO what a missing document would look like. It is reported, never
    # interpreted: `contiguous` is a fact, not a verdict, and it is null when the
    # range spans two Buddhist-era years, where the arithmetic is meaningless --
    # and, since migration 0018, null when the day holds bills from MORE THAN ONE
    # BRANCH: each branch mints its own series under its own prefix, so a span
    # across `B-2569-5` and `C-2569-3` interleaves two numberings and says
    # nothing. A number that interleaves two series is worse than no number.
    # `prefix_count` is the count of distinct prefixes among the day's numbered
    # bills; NULL prefixes (undocumented bills) do not count.
    span: int | None = None
    contiguous: bool | None = None
    if (
        summary["min_seq"] is not None
        and summary["min_be"] == summary["max_be"]
        and int(summary["prefix_count"]) == 1
    ):
        span = int(summary["max_seq"]) - int(summary["min_seq"]) + 1
        contiguous = span == int(summary["bill_count"]) - int(summary["undocumented_count"])

    quiet_for: float | None = None
    if day == today and summary["last_received_at"] is not None:
        quiet_for = round((as_of - summary["last_received_at"]).total_seconds(), 1)

    return {
        "day": {
            "date": day.isoformat(),
            "date_be": _be_date_label(start, day),
            "timezone": SHOP_TIMEZONE_NAME,
            # In shop offset, so the boundary reads as 00:00:00+07:00.
            "starts_at": _shop_iso(start),
            "ends_at": _shop_iso(end),
            "is_today": day == today,
            "requested": requested,
            # The server's own clock. A client subtracts to learn its own skew —
            # which is why no client_now parameter exists.
            "server_now": _shop_iso(as_of),
            "shop_today": today.isoformat(),
        },
        "basis": {
            "aggregated_on": "server_received_at",
            "boundary": "half-open [start, end) in shop time",
            "not_aggregated_on": "device_created_at",
            "why_en": (
                "device clocks are untrusted and measurably wrong; two phones"
                " have been observed stamping bills 125 ms apart in the order"
                " opposite to their arrival"
            ),
            "consequence_en": (
                "a bill weighed at 23:50 and synced at 00:05 counts in the NEXT"
                " day"
            ),
            "consequence_th": (
                "บิลที่ชั่งเวลา 23:50 แต่ส่งถึงระบบเวลา 00:05"
                " จะถูกนับเป็นยอดของวันถัดไป"
            ),
        },
        "totals": {
            # Aggregates over the WHOLE day. Never affected by limit/offset.
            "active_bill_count": int(summary["active_count"]),
            "active_total": _money(summary["active_total"]),
            "voided_bill_count": int(summary["voided_count"]),
            "voided_total": _money(summary["voided_total"]),
            "off_list_bill_count": int(off_list["off_list_bill_count"]),
            "off_list_line_count": int(off_list["off_list_line_count"]),
            # Paid minus list, over active bills. Positive = paid above list.
            "off_list_variance": _money(off_list["off_list_variance"]),
            "first_doc_no": summary["first_doc_no"],
            "last_doc_no": summary["last_doc_no"],
            "doc_no_span": span,
            "doc_no_contiguous": contiguous,
            "first_received_at": _shop_iso(summary["first_received_at"]),
            "last_received_at": _shop_iso(summary["last_received_at"]),
        },
        # Of THIS day's bills, the ones now void. Their money is excluded from
        # active_total above and their numbers are inside the doc_no range.
        "voided": [_void_payload(r, day) for r in voided],
        "voided_truncated": len(voided) >= _VOID_CAP,
        # Voids PERFORMED this day, including against older bills.
        "voids_applied": [_void_payload(r, day) for r in voids_applied],
        "voids_applied_truncated": len(voids_applied) >= _VOID_CAP,
        "bills": {
            "limit": limit,
            "offset": offset,
            "returned": len(lines),
            "total": int(summary["active_count"]),
            "truncated": offset + len(lines) < int(summary["active_count"]),
            "next_offset": (
                offset + len(lines)
                if offset + len(lines) < int(summary["active_count"])
                else None
            ),
            "lines": [
                {
                    "id": str(r["id"]),
                    "doc_no": r["doc_no"],
                    "received_at": _shop_iso(r["server_received_at"]),
                    "seller_code": r["seller_code"],
                    "seller_name": r["seller_name"],
                    "vehicle_no": r["vehicle_no"],
                    "item_count": int(r["item_count"]),
                    "total_amount": _money(r["total_amount"]),
                    "off_list": int(r["off_list_lines"]) > 0,
                    "off_list_line_count": int(r["off_list_lines"]),
                }
                for r in lines
            ],
        },
        "completeness": {
            "as_of": _shop_iso(as_of),
            "snapshot": (
                "one repeatable-read transaction — the totals and the lines are"
                " the same instant"
            ),
            # A CONSTANT. There is no device registry and no heartbeat, so the
            # server has no evidence with which to say false. See section 5.
            "understatement_possible": True,
            "understatement_reason_en": (
                "bills are written on the phone first and arrive here only when"
                " the network allows; the server cannot see or count what is"
                " still queued on a device"
            ),
            "understatement_reason_th": (
                "บิลถูกบันทึกในเครื่องก่อนแล้วจึงส่งเข้าระบบ"
                " ยอดนี้จึงนับเฉพาะบิลที่ส่งถึงระบบแล้ว"
                " บิลที่ยังค้างอยู่ในเครื่องยังไม่ถูกนับ"
            ),
            "cannot_know": [
                "how many bills are still unsynced on a phone, or their value",
                "whether every device that traded today has reported in",
                "bills weighed today that will arrive after midnight — those"
                " count in tomorrow, by design",
                "anything about a device that is switched off or out of range",
            ],
            # How long since anything arrived. Today only; null otherwise.
            "quiet_for_seconds": quiet_for,
            "quiet_for_seconds_note": (
                "NOT a sync check: a quiet period is an idle yard and a"
                " disconnected phone at the same time, and nothing here can tell"
                " them apart"
            ),
        },
    }


# ===========================================================================
# The period summary — the shop-owner dashboard's server half (P1.23 item 4)
#
# GET /reports/summary?from_date&to_date&by&state
#
# Where GET /reports/daily answers ONE shop day, this answers a PERIOD broken
# down by a DIMENSION. It is the aggregation the dashboard needs and the daily
# route does not do (ROADMAP § The completion sequence, "Pulled by P1.23 under
# S17, a widening not a step"). It adds no business rule: it totals rows that
# already exist, the same way daily does, and every DECISION it makes is written
# down because each is a place a plausible alternative returns a wrong number.
#
# WHAT IT IS AND IS NOT (the owner's decisions, ROADMAP § P1.23 item 4,
# 2026-08-30 — not this file's to re-open):
#
#   * D1 — STAFF SEE NO MONEY BY DEFAULT. Money visibility is a per-shop,
#     owner-controlled toggle (tenants.staff_money_visible, migration 0014) whose
#     only initial state is OFF. A staff caller is refused 403 while it is OFF.
#     When the owner turns it ON, a staff caller may read ONLY summaries of the
#     bills THEY created (created_by = self), never a shop-wide figure — this is
#     the ADVISOR'S READING of "when ON", pending the owner's word, and it is
#     built to here. Admin sees any scope regardless of the toggle.
#     SUPERSEDED 2026-09-04 (migration 0019): the toggle is gone, folded into the
#     staff role's grants as `money.view_own`. The three outcomes stand and are
#     keyed on the caller's permissions: `money.view_shop` sees any scope,
#     `money.view_own` sees own rows only, neither is 403 `permission_required`
#     naming money.view_own. The staff role is born WITHOUT it, so a new shop
#     starts exactly where 0014's DEFAULT false put it.
#
#   * D2 — VOIDS ARE A STATE, NOT A FOURTH AXIS. `state` in {live, void, all}
#     crosses every dimension; a voided bill is not a dimension of its own. And
#     EVERY MONEY FIGURE NAMES ITS PRICE BASIS: `paid_total` sums the stored
#     `amount` (the unit_price basis — what the shop PAID); `list_total` sums
#     `round(net_weight * list_price, 2)` (the list_price basis — a separately
#     labelled comparison). `list_minus_paid = list_total - paid_total` is their
#     ARITHMETIC DIFFERENCE and NOTHING MORE: it does NOT classify why the two
#     differ. A negotiated load, a stale-cache mispricing and a deliberate
#     override are byte-identical here — the server cannot tell them apart
#     (lessons/cached-master-data-is-a-price-claim.md), so the field NAMES only the
#     arithmetic it can establish, never a cause. The owner may READ this difference
#     as the override signal (D2) — the reading is the reader's; this route never
#     names or counts an "override". The cash close (P1.19) is elsewhere; nothing here
#     counts a drawer.
#
# THE AGGREGATION GRAIN IS THE ITEM. Money and weight come from
# purchase_bill_items (a bill's total_amount equals the sum of its items'
# `amount`, so day/seller/user agree whether summed from bills or items, and
# product can ONLY be summed from items). `bill_count = count(DISTINCT bill_id)`
# within the group: for by=day/seller/user a bill belongs to exactly one group,
# so the per-row counts partition the period's bills and sum to the total; for
# by=product a bill touching two products is counted in BOTH product rows, so the
# per-row counts sum to the total only when bills are single-product. The money
# and weight totals equal the sum of the rows for EVERY dimension, because every
# item belongs to exactly one product, one seller, one user and one day.
#
# THE WEIGHT IS net_weight — after any impurity deduction (0027). The stored `amount`
# was computed on the line's quantity under its own rounding rule (app/money_rules.py;
# before 0027 always round(net_weight * unit_price, 2), ROUND_HALF_UP). The list-basis
# figure rounds the SAME way, per line: line_amount_rounded(quantity, list_price, rule)
# in Postgres NUMERIC -- the function migration 0027's ck_items_amount holds every
# recorded line to -- with a pre-0027 line read as quantity = net, rule half_up_0.01,
# which is `round(net_weight * list_price, 2)`, the expression this used to be (and
# the identical one daily's off-list uses).
#
# THE DAY BOUNDARY AND THE DAY BUCKET ARE SHOP TIME, ON server_received_at.
# ARCHITECTURE §6: "Every report aggregates on server_received_at", converted to
# shop time BEFORE the date is taken. The range [from_date, to_date] is turned
# into two UTC instants by _day_window (the SAME function daily uses), so the
# predicate is a plain range on the bare column — indexable, and it does not make
# Postgres's IANA database a second timezone authority. by=day buckets each bill
# with `(server_received_at AT TIME ZONE <shop offset>)::date`, the offset taken
# from config.SHOP_TIMEZONE and from nowhere else, so a bill weighed 00:30 shop
# time falls in the correct shop day rather than the previous UTC one. NEVER
# device_created_at, never doc_no (lessons/doc-no-is-arrival-order-not-event-
# time.md, render-in-shop-time-not-device-time.md).
#
# ONE REPEATABLE-READ SNAPSHOT. The rows, the totals and the visibility flag are
# separate SELECTs the caller compares against each other, so they run in ONE
# repeatable-read transaction; under READ COMMITTED a bill committing between the
# rows query and the totals query would be in one and not the other, and the
# totals would not equal the sum of the rows (lessons/a-report-is-many-reads-
# that-must-agree.md). Read-only repeatable read cannot raise 40001.
#
# TENANT SCOPING IS RLS, exactly as in daily above and across this codebase: not
# one hand-written `WHERE tenant_id` here. FORCE ROW LEVEL SECURITY plus the
# composite FKs are the two independent mechanisms (ARCHITECTURE §8.1 rule 2,
# §8.2); a forgotten predicate returns NOTHING under FORCE, never another shop's
# rows (ARCHITECTURE §8.2:529-531). The only hand-written predicate here is the
# staff `created_by = self` scope, which is the FEATURE (D1), not tenant
# isolation.
#
# NO INDEX ADDED (this unit), same as daily. The by=day bucket wraps the column
# in a function, so no index serves it; at one shop's volume it is a sequential
# scan over a small table. A future-volume finding is recorded in OPEN_ITEMS.
#
# Money and weight are decimal STRINGS on the wire, produced by _money/_weight;
# never a JSON number (ARCHITECTURE §5 — a JSON number is a double before any
# client runs, and dailyView-shape readers treat it as a MISSING field).
# ===========================================================================

_WEIGHT_ZERO = Decimal("0.000")

# The inclusive day-span ceiling. A year plus a day of slack; a request wider
# than this is a mistake or an unbounded scan, refused with a named 422.
_SUMMARY_MAX_SPAN_DAYS = 366

# The shop's UTC offset in whole SECONDS, derived from the ONE server-side
# timezone authority (config.SHOP_TIMEZONE) and nowhere else, bound as an integer.
# The by=day bucket shifts by it without naming a second timezone:
# `AT TIME ZONE make_interval(secs => 25200)` is pure offset arithmetic, not an
# IANA lookup, so Postgres's own zone database is never a second authority beside
# config.py. Bound as an int rather than an interval string because asyncpg
# encodes an interval parameter from a timedelta, not from text. If SHOP_TIMEZONE
# ever becomes per-tenant (config.py says it must move to real ZoneInfo then),
# this derivation moves with it; today it is +07:00 for every shop.
_SHOP_OFFSET_SECONDS = int(SHOP_TIMEZONE.utcoffset(None).total_seconds())

# The by=day bucket: the bill's shop-local date. The offset is a bind parameter,
# so config.SHOP_TIMEZONE stays the sole authority for what "+07" is.
_DAY_BUCKET = (
    "(b.server_received_at AT TIME ZONE make_interval(secs => :shop_offset_secs))::date"
)


def _weight(value: Any) -> str:
    """A NUMERIC weight as an exact decimal STRING, always three places.

    Decimal in, string out, no float anywhere — the weight sibling of _money.
    net_weight is NUMERIC(14,3); three places is its declared scale.
    """
    return str(Decimal(value or 0).quantize(_WEIGHT_ZERO, rounding=ROUND_HALF_UP))


# The four dimensions, enumerated in ONE place so a fifth cannot be added to the
# query without being added here (lessons/a-quantified-sentence-names-no-member).
# Every fragment below is a LITERAL from this module — never a caller string — so
# it is composed into SQL the way master.py composes its dynamic SET: the caller
# chooses only WHICH key of this dict via a validated Literal, never its value.
#
#   key   — the row's stable identity (product/user id, seller code, shop date)
#   label — the human name beside it (product/seller name, username, the date);
#           for by=user the key is user_id and the username merely rides beside
#           it, because (tenant_id, user_id) is the only permanent name a person
#           has and a username belongs on a screen (ARCHITECTURE §4 point 4).
#   join  — a LEFT join for the label, with NO is_active predicate: a retired
#           seller or product must still resolve on the day it traded, exactly as
#           daily's lines join does (INNER would silently drop the row and leave
#           the total disagreeing with its own breakdown).
#   group / order — the GROUP BY and a deterministic ORDER BY on the key.
_BY_DIMENSIONS: dict[str, dict[str, str]] = {
    "product": {
        "key": "i.product_id::text",
        "label": "p.name",
        "join": " LEFT JOIN products p ON p.id = i.product_id",
        "group": "i.product_id, p.name",
        "order": "i.product_id::text",
    },
    "seller": {
        "key": "s.code",
        "label": "s.name",
        "join": " LEFT JOIN sellers s ON s.id = b.seller_id",
        "group": "b.seller_id, s.code, s.name",
        "order": "s.code",
    },
    "user": {
        "key": "b.created_by::text",
        "label": "u.username",
        "join": " LEFT JOIN users u ON u.id = b.created_by",
        "group": "b.created_by, u.username",
        "order": "b.created_by::text",
    },
    "day": {
        "key": f"to_char({_DAY_BUCKET}, 'YYYY-MM-DD')",
        "label": f"to_char({_DAY_BUCKET}, 'YYYY-MM-DD')",
        "join": "",
        "group": _DAY_BUCKET,
        "order": _DAY_BUCKET,
    },
}

# Void as a STATE crossing every dimension (D2), never a fourth axis. A literal
# fragment per state; `all` adds nothing.
_STATE_PREDICATES: dict[str, str] = {
    "live": " AND b.voided_at IS NULL",
    "void": " AND b.voided_at IS NOT NULL",
    "all": "",
}

# The four aggregates, shared by the grouped rows query and the ungrouped totals
# query so the two cannot compute money two different ways. coalesce(...,0) so a
# group or a period with no matching rows reads 0, not NULL.
_SUMMARY_AGGREGATES = (
    "count(DISTINCT i.bill_id)                            AS bill_count,"
    " coalesce(sum(i.net_weight), 0)                      AS net_weight,"
    " coalesce(sum(i.amount), 0)                          AS paid_total,"
    # The list basis under the LINE's own quantity and rounding rule (0027): a piece- or lump-priced
    # line, or one rounded to the baht, compares like with like. A line received before its rules
    # were recorded reads net x list half-up to the satang -- exactly the expression this was.
    " coalesce(sum(public.line_amount_rounded(coalesce(i.quantity, i.net_weight), i.list_price,"
    "                 coalesce(i.rounding_rule, 'half_up_0.01'))), 0) AS list_total"
)


def _summary_rows_sql(by: str, where: str) -> str:
    """The grouped query for one dimension. `by` is a validated Literal key of
    _BY_DIMENSIONS; `where` is composed from literal fragments in the handler."""
    d = _BY_DIMENSIONS[by]
    return (
        f"SELECT {d['key']} AS key, {d['label']} AS label, {_SUMMARY_AGGREGATES}"
        f"  FROM purchase_bills b"
        f"  JOIN purchase_bill_items i ON i.bill_id = b.id"
        f"{d['join']}"
        f" WHERE {where}"
        f" GROUP BY {d['group']}"
        f" ORDER BY {d['order']}"
    )


def _summary_totals_sql(where: str) -> str:
    """The ungrouped totals, computed INDEPENDENTLY of the rows so that the proof
    can assert totals == sum(rows) rather than have it hold by construction."""
    return (
        f"SELECT {_SUMMARY_AGGREGATES}"
        f"  FROM purchase_bills b"
        f"  JOIN purchase_bill_items i ON i.bill_id = b.id"
        f" WHERE {where}"
    )


def _summary_figures(r: Any) -> dict:
    """The five money/weight/count figures, from a rows or totals mapping. Money
    and weight as decimal STRINGS; list_minus_paid computed here from the two
    already-2-place bases, so it is exact and never a float."""
    paid = Decimal(r["paid_total"] or 0)
    listed = Decimal(r["list_total"] or 0)
    return {
        "bill_count": int(r["bill_count"]),
        "net_weight": _weight(r["net_weight"]),
        # unit_price basis: the purchase value at the price agreed per unit (the
        # stored amount), NOT cash disbursed. It stays a purchase figure when a bill
        # is UNPAID (separate_cashier on, 0020): the drawer is the ledger's, never
        # this route's -- "nothing here counts a drawer" (D2 above). The client
        # labels it as a price, not as "จ่ายจริง" (cash), for exactly this reason.
        "paid_total": _money(paid),
        # list_price basis: a separately-labelled comparison, NOT what was paid.
        "list_total": _money(listed),
        # list_total - paid_total. The arithmetic difference of the two bases and
        # nothing more — the name states no cause (see the section note).
        "list_minus_paid": _money(listed - paid),
    }


@router.get("/reports/summary")
async def summary_report(
    from_date: dt.date = Query(
        ...,
        description=(
            "Shop-local calendar start date (YYYY-MM-DD, UTC+7), inclusive."
            " Converted to a server_received_at instant with the same offset"
            " /reports/daily uses."
        ),
    ),
    to_date: dt.date = Query(
        ...,
        description=(
            "Shop-local calendar end date (YYYY-MM-DD, UTC+7), inclusive. Must be"
            " >= from_date, and the inclusive span must be <= 366 days."
        ),
    ),
    by: Literal["product", "seller", "user", "day"] = Query(
        ...,
        description=(
            "The breakdown dimension. product/user rows are keyed by id, seller"
            " by code, day by shop-local date; each row carries the display name"
            " beside its key."
        ),
    ),
    state: Literal["live", "void", "all"] = Query(
        "live",
        description=(
            "Void is a STATE, not a dimension: live = voided_at IS NULL, void ="
            " voided_at IS NOT NULL, all = both. bill_count counts bills in that"
            " state."
        ),
    ),
    # get_principal, NOT a route gate: any signed-in caller is admitted, then
    # gated INSIDE the handler on which of two permissions they hold (0019) --
    # money.view_shop for any scope, money.view_own for their own rows, neither
    # for a 403 naming money.view_own.
    principal: Principal = Depends(get_principal),
) -> dict:
    """Aggregate purchase bills over a period, broken down by one dimension.

    Returns `{from_date, to_date, by, state, rows, totals}`. Each row and totals
    carry `key`, `label`, `bill_count`, `net_weight` (3dp string), `paid_total`
    (what the shop PAID, unit_price basis, 2dp string), `list_total` (the
    list_price comparison, 2dp string) and `list_minus_paid` = list_total -
    paid_total (their arithmetic difference; the name states no cause). The owner
    reads this difference as the override signal (D2) — the reading is the reader's.
    totals carries the same fields with `key`/`label` null.

    A caller holding `money.view_shop` sees any scope. One holding only
    `money.view_own` sees ONLY their own bills (created_by = self), regardless of
    `by`. One holding neither is refused 403 `permission_required` naming
    `money.view_own` (0019; this was the `staff_money_hidden` refusal keyed on
    tenants.staff_money_visible, which 0019 folded into the staff role's grants).
    Aggregates on `server_received_at` in shop time; voids are a `state`.
    """
    # ---- validate the range (lessons/edge-must-reject-what-the-column-rounds):
    # a bad range is a terminal, field-named 422, never a 500 the client reads as
    # `unavailable` and retries for ever. `by`/`state` outside their sets are
    # refused by the Literal type as a 422 whose loc names the field.
    if to_date < from_date:
        raise _invalid(
            "date_range_inverted",
            "ช่วงวันที่ไม่ถูกต้อง วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น",
            field="to_date",
            from_date=from_date.isoformat(),
            to_date=to_date.isoformat(),
        )
    span_days = (to_date - from_date).days + 1
    if span_days > _SUMMARY_MAX_SPAN_DAYS:
        raise _invalid(
            "date_range_too_wide",
            f"ช่วงวันที่กว้างเกินไป สูงสุด {_SUMMARY_MAX_SPAN_DAYS} วัน",
            field="to_date",
            span_days=span_days,
            max_span_days=_SUMMARY_MAX_SPAN_DAYS,
        )

    # from_date's shop-midnight start to the shop-midnight END of to_date, both as
    # UTC instants — the SAME _day_window daily uses, so the two routes cannot
    # disagree about where a day begins.
    start, _ = _day_window(from_date)
    _, end = _day_window(to_date)
    params: dict[str, Any] = {
        "start": start,
        "end": end,
        "shop_offset_secs": _SHOP_OFFSET_SECONDS,
    }

    where = "b.server_received_at >= :start AND b.server_received_at < :end"
    where += _STATE_PREDICATES[state]

    # THE MONEY GATE, on the permission set the principal carries (0019). No row
    # is read for it: the grants were resolved from the users -> roles ->
    # role_permissions join in get_principal, for THIS request.
    if not principal.has(Permission.MONEY_VIEW_SHOP):
        if not principal.has(Permission.MONEY_VIEW_OWN):
            # 403, pinned to detail.code and naming the permission — not 422
            # (the request is fine), not 424 (no master data is missing), not 5xx
            # (retrying changes nothing). Only a human granting money.view_own
            # or money.view_shop to this caller's role clears it.
            raise permission_required(Permission.MONEY_VIEW_OWN)
        # money.view_own only: FORCED to the caller's OWN bills, regardless of
        # `by`. Such a caller never sees a shop-wide figure; by=user then
        # returns exactly one row — themselves. This is the ONE hand-written
        # predicate here, and it is the feature (E1), not tenant isolation
        # (that is RLS).
        where += " AND b.created_by = :self_user_id"
        params["self_user_id"] = principal.user_id

    async with tenant_connection(
        principal.tenant_id, isolation_level="REPEATABLE READ"
    ) as conn:
        rows = (
            await conn.execute(text(_summary_rows_sql(by, where)), params)
        ).mappings().all()
        totals = (
            await conn.execute(text(_summary_totals_sql(where)), params)
        ).mappings().one()

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "by": by,
        "state": state,
        "rows": [{"key": r["key"], "label": r["label"], **_summary_figures(r)} for r in rows],
        # key/label null: totals is the aggregate over every row, keyed by nothing.
        "totals": {"key": None, "label": None, **_summary_figures(totals)},
    }


# ---------------------------------------------------------------------------
# M2 (ADVISOR-DECIDED 2026-10-25): SALES AND GROSS PROFIT
# ---------------------------------------------------------------------------
# Live sale bills only (a voided bill sold nothing). Amount is the lines' stored amount; cost is the lines'
# STORED cost_amount -- never re-derived from today's ledger (hard rule 6: a purchase that syncs late does not
# move a sale already costed). gross_profit = amount - cost. It is named gross_profit (กำไรขั้นต้น in every
# client) and NEVER `profit`: net profit needs expenses, which arrive with M3.
# The day bucket is the fixed shop offset (_SHOP_OFFSET_SECONDS, from config.SHOP_TIMEZONE), exactly as the purchase
# report's _DAY_BUCKET -- never a named zone, which would make Postgres's tz database a second authority beside the
# _day_window this route bounds its range with (red team 2026-10-25, finding 5; BRIEFING section 7).
_SALE_DAY = "(s.server_received_at AT TIME ZONE make_interval(secs => :shop_offset_secs))::date::text"
_SALES_GROUPS = {
    "day": (_SALE_DAY, _SALE_DAY),
    "product": ("i.product_id::text", "max(p.code) || ' ' || max(p.name)"),
    "buyer": ("s.buyer_id::text", "max(b.code) || ' ' || max(b.name)"),
}


@router.get("/reports/sales")
async def sales_report(
    from_date: dt.date = Query(..., description="first shop day, inclusive"),
    to_date: dt.date = Query(..., description="last shop day, inclusive"),
    by: Literal["day", "product", "buyer"] = Query("day"),
    category_id: uuid.UUID | None = Query(None),
    product_id: uuid.UUID | None = Query(None),
    buyer_id: uuid.UUID | None = Query(None),
    principal: Principal = Depends(require(Permission.MONEY_VIEW_SHOP)),
) -> dict:
    if to_date < from_date:
        raise _invalid("range_reversed", "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น")
    key, label = _SALES_GROUPS[by]
    where = ["s.voided_at IS NULL", "s.server_received_at >= :f", "s.server_received_at < :t"]
    params: dict[str, Any] = {"f": _day_window(from_date)[0], "t": _day_window(to_date)[1],
                              "shop_offset_secs": _SHOP_OFFSET_SECONDS}
    for col, val, name in (("p.category_id", category_id, "cat"), ("i.product_id", product_id, "prod"),
                           ("s.buyer_id", buyer_id, "buyer")):
        if val is not None:
            where.append(f"{col} = :{name}")
            params[name] = val
    base = (" FROM sale_bill_items i JOIN sale_bills s ON s.id = i.bill_id JOIN products p ON p.id = i.product_id"
            " JOIN buyers b ON b.id = s.buyer_id WHERE " + " AND ".join(where))
    # Rows and totals are TWO reads an owner compares: one snapshot, as the daily and summary routes (finding 3;
    # lessons/a-report-is-many-reads-that-must-agree.md).
    async with tenant_connection(principal.tenant_id, isolation_level="REPEATABLE READ") as conn:
        rows = (await conn.execute(text(
            f"SELECT {key} AS key, {label} AS label, count(DISTINCT s.id) AS bills, sum(i.amount) AS amount,"
            f" sum(i.cost_amount) AS cost, max(i.unit_code) AS unit_code, count(DISTINCT i.unit_code) AS units,"
            f" sum(i.quantity) AS quantity{base} GROUP BY {key} ORDER BY {key}"), params)).mappings().all()
        tot = (await conn.execute(text(f"SELECT count(DISTINCT s.id) AS bills, coalesce(sum(i.amount), 0) AS amount,"
                                       f" coalesce(sum(i.cost_amount), 0) AS cost{base}"), params)).mappings().one()
    def figures(r: Any) -> dict:
        amount, cost = Decimal(r["amount"] or 0).quantize(Decimal("0.01")), Decimal(r["cost"] or 0).quantize(Decimal("0.01"))
        return {"bills": int(r["bills"]), "amount": str(amount), "cost": str(cost), "gross_profit": str(amount - cost)}
    return {
        "from_date": from_date.isoformat(), "to_date": to_date.isoformat(), "by": by,
        "rows": [{"key": r["key"], "label": r["label"], **figures(r),
                  # A product row sums ONE unit; a day or buyer row mixes units, so its quantity means nothing and
                  # is not sent (never a kilogram added to a piece).
                  **({"quantity": str(r["quantity"]), "unit_code": r["unit_code"]} if by == "product" and r["units"] == 1 else {})}
                 for r in rows],
        "totals": figures(tot),
    }
