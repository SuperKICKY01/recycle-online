# A strict ordered queue CAN deadlock. Don't skip the head — make the jam visible.

Phase 2c-3/5.1 built a strict head-of-line send queue: only the oldest pending
bill is ever sent, nothing behind it may overtake, so document numbers follow
weighing order (see [[doc-no-is-arrival-order-not-event-time]]). While building
it I wrote, in a code comment AND in a lesson, that this "cannot deadlock." That
was wrong, and it was the confident-wrong kind that hides a real bug.

## The failure

A bill can make the server fail **deterministically** — a 5xx on that specific
payload every time. Per [[unavailable-is-not-rejected]] a 5xx is `unavailable`,
not `rejected`: the client cannot know the server will never accept it, so it
retries **forever** under a capped backoff. That is correct in isolation. Under
strict head-of-line order it is a trap: the poisoned bill sits at the head and
**dams every bill behind it, forever, on that one device, silently** — while
staff keep weighing loads and saving bills into the growing backlog, seeing
nothing wrong. A practical deadlock, even though no lock is held.

"It retries forever so it can't deadlock" reasons about the ONE bill. The
deadlock is about **everything behind it**.

## The fix that is NOT the fix

Auto-skipping the stuck head so the queue drains. It trades a visible problem
for a silent one: the document numbers now come out in the wrong order and
nobody is told. For legal-document numbering that is **worse** than the jam. The
ordering guarantee is the whole point; do not quietly break it to relieve a
symptom.

## The fix

Keep the ordering. Make the jam **loud** — but only the RIGHT jam.

- Record when the head **first** failed (`first_attempt_at`, stamped once with
  `COALESCE`, never moved — a `next_attempt_at` that slides forward each backoff
  cannot measure "how long has this been stuck"). This is the total-stuck clock.
- Assess the queue with a pure function (`sync/queueHealth.ts`): the head is
  blocking when it has actually bounced (`attempts > 0`) **and** bills wait
  behind it.
- **Distinguish an offline backlog from a poisoned head — they are not the same
  alarm.** A yard that has simply lost signal piles up a backlog too, and it must
  stay CALM AMBER however long that lasts, or the alarm cries wolf on every dead
  spot and the operator learns to ignore the strip. Only a bill the REACHABLE
  server keeps refusing is a fault to escalate (red, "call support").
- Surface it where it cannot be missed: the always-visible status strip says, in
  plain Thai, that one bill is stuck and is holding up N behind it; the bill list
  marks which bill is the blocker. Visible without opening anything.

The signal that separates offline from poisoned is **not** time and **not**
attempt count — a long outage and a poison pill both bounce many times over many
minutes, so any threshold on elapsed time *alone* flags the honest outage too.
The reliable signal is whether the **server answered**: a bounce carrying an HTTP
status (a 5xx) proves the network is usable and the server still refused
(poison); a transport-level bounce (timeout, no route, no token) proves nothing
got through (offline). Capture it at the source — `SendOutcome.reachable`, set by
the transport where the truth is known, never by string-matching an error message
later — and carry it as `first_server_error_at`: stamped while the reachable
server is refusing, RESET to null the moment a bounce is transport-level. Non-null
then means exactly "the reachable server has been refusing this bill continuously
since this instant", which is both the poison fact and its duration in one field.

So there are TWO knobs, both guesses to tune against a real yard's network: the
reachability signal above, and `POISON_ALARM_MS` — how long the reachable refusal
must persist before red, measured from `first_server_error_at` so time merely
spent offline never counts toward it. The offline/amber state has no timer at all;
it is honest for as long as the network is down.

## Amendment: a COUNT may escalate, but must never classify

Read this before concluding the code contradicts the paragraph above.

`assessQueue` now raises the red alarm on EITHER of two triggers: the refusal has
persisted past `POISON_ALARM_MS`, **or** the reachable server has refused the head
`POISON_ALARM_ATTEMPTS` times in a row. That is not a reversal of "not attempt
count", because the two statements are about different questions:

- **Classifying** a jam as offline vs poisoned — still decided SOLELY by whether
  the server answered. Unchanged, and it is what the paragraph above is about.
- **Escalating** a head that is ALREADY classified poisoned — may use a count.

The clock alone assumed a poisoned bill takes time to become obvious. That holds
only while the backoff is short: a fast-answering server, a device retrying since
before a restart, or a backoff already at its cap can burn through many refusals
inside one threshold window. Each of those refusals is direct evidence the bill
will not go, so waiting out a timer while holding five of them is simply a later
alarm.

**The property that makes the count safe is that it RESETS.**
`server_error_attempts` is incremented only on a server-answered bounce and set
back to 0 by any transport-level one, exactly like `first_server_error_at`. An
offline yard therefore cannot accumulate it, however long it is down. Using
`attempt_count` instead would reintroduce precisely the cry-wolf failure this
lesson warns about: it counts every attempt of any kind and never resets, so a
device that spent a night offline would arrive at morning with a large count, no
server error at all, and a red alarm.

If you ever move this counter, keep the reset. The reset is the lesson.

**Where the amendment is proven.** `proveSync.ts` CASE 9d, on both stores: the
alarm fires at 30s elapsed against a 90s clock threshold (so it was the count, not
the clock), the head is still never skipped, and — the disproof — an OFFLINE head
bounced 10 times with `serverErrorAttempts` still 0 and stayed calm amber.

## How to apply

1. Any strict in-order queue with no-give-up retry can deadlock behind a
   deterministically failing item. Assume it will, and design the *visibility*,
   not just the retry.
2. Never relieve a head-of-line jam by reordering or dropping the head unless
   losing order is acceptable — here it is not.
3. "Retries forever" is a property of one item; a queue's health is about what
   is stuck behind it. Measure and show that.
4. A stalled retry queue can be OFFLINE or POISONED, and staff respond to them
   differently (wait it out vs call support), so the UI must tell them apart. Do
   it on whether the server ANSWERED — an HTTP status came back — captured at the
   transport, never on elapsed time or attempt count, which cannot separate a
   long outage from a poison pill.

**Where proven.** `mobile/src/proof/proveSync.ts` CASE 9, in three parts on both
stores. 9a: an OFFLINE backlog driven PAST the threshold stays amber — stuck for
longer than `POISON_ALARM_MS`, yet `alarm=false` and `poisonedForMs=0`. 9b: a
POISONED head (a reachable 5xx every time) with three bills behind it goes red
once it persists, reporting blocker id, count behind and elapsed, and the alarm
is held off below the threshold so the case is not vacuous. 9c: the two are
asserted DISTINGUISHABLE, and that it is the reachable-server signal, not the
clock, that separates them — both waited past the threshold, only the
reachable-refusal one went red. Then the server recovers and the backlog drains
in weighing order, proving the poisoned queue was jammed, not dead.
