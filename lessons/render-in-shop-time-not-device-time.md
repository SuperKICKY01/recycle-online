# Store UTC, render in the SHOP's timezone — and never slice an ISO string

**Rule.** Timestamps are stored as UTC instants. Exactly ONE module per side
turns an instant into something a human reads, and it converts to the SHOP's
timezone. Nothing else may format a timestamp — no `getHours()`, no
`toLocaleString()`, and above all no slicing the ISO string.

## What happened

The bill list showed a load weighed 15:16 in Bangkok as **08:16**. Exactly seven
hours — the UTC offset.

```tsx
{b.created_at.slice(0, 10)} {b.created_at.slice(11, 16)}   // BillsPanel
```

`created_at` is `toISOString()` output, so characters 11–15 are the **UTC** clock.
The slice never parses a date and never converts anything; it prints UTC verbatim.

Storage was innocent, and checking that first is what kept the fix in the right
layer: Postgres held `timestamptz` with `tzinfo=UTC`, SQLite held
`"2026-07-26T11:00:18.672Z"` (TEXT, explicit `Z`) written on a device whose local
clock read 18:00. Both correct.

## The rival explanation, and how it was killed

"The phone's timezone is set to UTC" fits the symptom just as neatly, and would
have sent the fix to the wrong place entirely. The disproof was one experiment —
run the formatter under two process timezones:

| device TZ | bill list (slice) | status strip (`getHours`) |
|---|---|---|
| `Asia/Bangkok` | **11:00** | 18:00 ✓ |
| `UTC` | **11:00** | 11:00 |

The bill list prints the same value under both, because a string slice cannot
consult a timezone. Device configuration could not have caused it and could not
have fixed it. The status strip is the control: it *was* correct on a properly
set phone, which is why only one screen was reported.

## Why the SHOP's zone and not the device's

A business day belongs to the shop, not to whichever handset is in someone's
pocket. Device-local formatting means a phone on the wrong timezone, or carried
across a border, silently relabels which day a load was bought on — and SRS 3.3
daily totals then differ depending on who opens the screen. `getHours()` is not
"the safe option"; it is a different wrong answer that merely happens to be right
while the phone is configured correctly.

## The same bug bites dates, not just clocks

A UTC-derived DATE is wrong for a whole slice of every day. In Bangkok
(UTC+7) anything between **00:00 and 06:59** local is still yesterday in UTC:

```
weighed 2026-07-27 00:30 Bangkok -> stored 2026-07-26T17:30Z -> displayed 2026-07-26
```

Server-side this reached `doc_no`. `be_year` came from
`datetime.now(tz=timezone.utc).year`, so a bill arriving 2027-01-01 00:30 in
Bangkok took **be_year 2569 instead of 2570** — and because `doc_no_counters` is
keyed on `(tenant_id, be_year)`, it would also have continued the previous year's
sequence, so the new year would not restart at 1 and two business years would
share a counter. On legal document numbering.

## Two constraints found while fixing it — verify, don't assume

- **Python `zoneinfo` cannot resolve `Asia/Bangkok` on Windows.** No IANA
  database ships with Windows and `tzdata` was not installed:
  `ZoneInfoNotFoundError`. A named fixed offset
  (`timezone(timedelta(hours=7), "Asia/Bangkok")`) avoids the dependency.
- **Hermes `Intl` with a `timeZone` option is UNVERIFIED on a device.** If it were
  silently ignored, the display would fall straight back to UTC — the exact bug
  being fixed, reintroduced invisibly. Same reasoning as
  `ids.ts` choosing `expo-crypto` over an unchecked global.

Both are why the shop zone is a fixed offset today. That is only sound because
**Thailand has observed UTC+7 with no daylight saving since 1920**. A per-tenant
timezone WILL include zones with DST, and a fixed offset cannot express those —
that migration must move to real IANA handling and be verified on a device.

## How to apply

1. Store instants (UTC). Never store or compare a formatted local string.
2. One formatter per side, one timezone constant per side, and a comment
   forbidding every other path. Two formatters is two behaviours
   ([[unavailable-is-not-rejected]] is the same shape: make the type system or
   the module boundary carry the rule, not someone's memory).
3. Any DATE derived for business meaning — report boundaries, document-number
   years, "today's takings" — converts to shop time FIRST. Aggregates still key
   on `server_received_at` ([[doc-no-is-arrival-order-not-event-time]]); this is
   about which day that instant falls in.
4. When a display looks time-shifted, check STORAGE before blaming the renderer,
   and check whether the suspect path can even see a timezone before blaming
   configuration ([[diagnosis-must-precede-the-fix]]).

**Where proven.** `mobile/src/proof/proveTime.ts` — the three reported instants,
the 00:30 / 06:59 / 07:00 / 23:59 boundary, the new-year case, and a placeholder
for unparseable input. It is run TWICE, under `TZ=Asia/Bangkok` and `TZ=UTC`, and
must produce identical output; a device-dependent helper passes one and fails the
other. Server side, `server/scripts/prove_shop_time.py` proves `_be_year` across
the new-year window INCLUDING the disproof that the old UTC expression really
answered 2569, then proves over real HTTP that the value reaches both `doc_no`
and the `doc_no_counters` key.

**DONE since:** `shopDate()` now returns พ.ศ. (`26/07/2569`) — see
[[be-year-comes-after-the-timezone]]. Splitting it out was the right call: the
`+543` has to land *after* the conversion this lesson is about, and separating
the two passes is what made the ordering provable instead of entangled. A wrong
year and a wrong offset still look identical in a screenshot.

**Still outstanding:** the desktop thermal slip. `desktop/` is empty, so no
printed slip exists yet, but CLAUDE.md requires พ.ศ. there too and a slip is what
the seller keeps. It is the next consumer of this module and must port the module,
not re-implement the formatting — a second `+543` in Electron is a second
behaviour, and the two would drift at exactly the boundary neither author tested.
