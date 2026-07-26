# doc_no is arrival order; device clocks are wrong. Report on server time.

Two facts observed on a real iPhone against the real server, one hour apart.
They point at the same rule and it is easy to get wrong in opposite directions.

## 1. doc_no reflects when the bill ARRIVED, not when the load was weighed

`doc_no` is assigned by the server, from a locked counter, at the moment the
bill lands. On an offline-first client that is emphatically not the order the
loads were bought:

| doc_no | weighed (device) | arrived (server) |
|---|---|---|
| B-2569-34 | 22:53:38 | 22:55:11 |
| B-2569-33 | **22:54:51** | 22:54:59 |

The load weighed FIRST got the HIGHER number. The mechanism was not a bad sort:
bill 34's first send failed, so its retry backoff pushed `next_attempt_at` about
30 seconds out, and the send queue was filtered by `next_attempt_at <= now`.
Bill 34 was therefore **not in the candidate set at all**, while bill 33 —
weighed 73 seconds later — was immediately sendable and went first.

**A sort cannot order a row the query does not return.** This is the trap: the
obvious fix ("order the queue by weighing time") is correct, necessary, and on
its own would not have changed this outcome by a single number.

### What actually fixes it

Strict head-of-line order over ALL pending bills, backoff included:

- read the pending queue **without** the backoff filter, ordered by
  `device_created_at`;
- only the head may be sent. If the head is in backoff, in flight, or already
  attempted this pass and still pending, the pass **stops** — nothing behind it
  may overtake.

The cost is deliberate and must be understood before copying this: one
unsendable bill holds up every bill behind it. That is the right trade when the
numbers are legal documents. But it CAN practically deadlock — a bill that fails
deterministically retries forever and dams the queue on that device, silently.
Do not "solve" that by skipping the head; the fix is to make the jam visible.
See [[queue-jam-must-be-visible]], which is the sharp edge of this rule.

A successful send additionally clears the stale backoff on every other pending
bill: that send is direct evidence the server is reachable, so the delays behind
it were computed against a world that no longer exists.

### What this still does NOT buy you

Ordering is bounded by the backlog, not by history. A bill held offline
overnight still arrives after today's bills and still takes a later number.
`doc_no` is a gap-free arrival sequence and nothing more. **Never present it as
chronological, sort a report by it, or infer "which came first" from it.**

## 2. The device clock is measurably wrong

Same device, four bills, `server_received_at - device_created_at`:

```
B-2569-27  -3.352s      B-2569-28  -3.109s
B-2569-32  -2.843s      B-2569-35  -2.824s
```

Consistently ~3 seconds AHEAD of the server — and negative, meaning the phone
reports a bill as created *after* the server had already received it. Nothing
was misconfigured; this is an ordinary phone on network time. Skew is not an
edge case to defend against, it is the normal condition.

Hence project hard rule 7 keeping both timestamps, and the rule that follows
from it:

**Every report, every total, every "today's takings", every ordering, and every
date filter keys on `server_received_at`. `device_created_at` is evidence of
what the device believed, useful for ordering our own outbound queue and for
disputes — never an authority on when something happened.**

The failure this prevents is quiet and expensive: a bill weighed at 23:59:58 by
a phone running three seconds fast lands in yesterday's takings on the device
and today's on the server. Two reports, both "correct", that do not reconcile —
and the shop counts a day's cash twice or not at all.

## How to apply

1. Ordering a queue that decides document numbers? Order by the event time AND
   make sure the query returns every candidate. Prove it with a case where the
   older row is deliberately gated — a test where everything is eligible passes
   whether or not the bug is fixed ([[wait-for-the-event-not-the-ticks]],
   [[concurrency-tests-need-a-barrier]]).
2. Any aggregate over time: `server_received_at`. No exceptions.
3. Treat `doc_no` as an identifier, never as a timestamp.

**Where proven.** `mobile/src/proof/proveSync.ts` CASE 8 (a five-bill backlog
weighed out of order drains in weighing order) and CASE 8b, which reproduces the
device sequence exactly and first asserts that the backoff-filtered queue *would*
have offered the newer bill — so the case cannot pass vacuously. The queue lives
in `SqliteLocalStore.listPendingOldestFirst`; the head-of-line rule is in
`SyncEngine.runOnce`.
