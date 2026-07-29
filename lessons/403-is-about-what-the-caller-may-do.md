# A 403 is the fourth class: the caller is SOMEONE, and may not do this

Applies to every authenticated path, and to every screen assembled from more than
one renderer. Sibling of [[401-is-about-the-caller-not-the-bill]] — same question,
different answer, and the difference decides what the app does.

## The rule that produced it

[[401-is-about-the-caller-not-the-bill]] says: before choosing a failure class,
ask what the failure is ABOUT — the payload, the network, the server's state, or
the identity of the caller. A 403 is about the caller, like a 401. That is where
the resemblance stops, and the axis they differ on is the ACTION:

| | 401 | 403 |
|---|---|---|
| who is the caller | **nobody** — the token is dead | **someone**, definitely |
| what fixes it | one tap, on this device, now | a **different person**, elsewhere |
| does signing in help | yes — that IS the class | **no**: same user, same role |
| does it clear on sign-in | always | only if the identity really changed |

So `forbidden` is its own `SendOutcome`/`VoidOutcome` member, not a variant of
`session_expired`. Three reasons, in order of how expensive getting them wrong is:

1. **The session class is DEFINED by carrying its own action.** That lesson's
   second property is "the message must carry its own action", and the action is
   the sign-in button. For a 403 that button is a loop with a person in it: the
   same account comes back with the same role. Either the button lies, or the
   class stops always having one — and then it no longer means anything.
2. **It would evaporate every pass.** `App.syncOnce` clears `sessionEnded` on ANY
   server answer at all (`r.synced > 0 || r.rejected > 0 || r.masterDataBlocked > 0`),
   because for a session that is correct — an answered request proves the token
   works. Fold a role refusal in there and it is retracted by the next successful
   send and re-raised by the next tap, forever, flickering.
3. A new union member is a compile error in every `switch`, both stores, the fakes
   and the view. That is how the engine, the store, `billNotice`, the two style
   Records and 19 proof call sites were all found in one pass.

**The wording follows from the same distinction.** Never "sign in again" — that is
the 401's fix and here it is a loop. Never "call support" — support cannot grant a
role. It names the shop owner (`เจ้าของร้าน`), and specifically NOT the office
(`สำนักงาน`), which is who the parked-bill wording names: the office sets prices
and grades, a role is the owner's. A wrong instruction is worse than a vague one
because it gets acted on ([[correct-classification-can-still-render-as-an-error]]).

## The defect this actually shipped: one card, two renderers

The refusal reached the client correctly. `billNotice` was taught it, the tone was
right, the store stopped retrying, the strip said the true thing. And the card
still contradicted itself, because `voidProgressLine` — drawn TWO LINES ABOVE the
notice box, on the same card, by the same component — had not been taught it and
went on returning:

> รอแจ้งระบบ จะดำเนินการให้อัตโนมัติ   *(waiting to tell the system; it will be done automatically)*

directly above

> บัญชีนี้ไม่มีสิทธิ์ยกเลิกบิล ระบบจึงยังไม่ได้ยกเลิกบิลใบนี้
> *(this account may not cancel bills, so the system has not cancelled this one)*

Both renderers were internally correct and separately asserted. Every sweep in
`proveNotice` read ONE of them at a time — 384 card cells, 64 void cells, all
green — and not one of them could see the contradiction, because **the operator
does not read a function, they read a card.** The reassuring half is the one
someone with wet hands and a queue behind them will believe.

**The fix that matters is not the branch, it is N2b:** a sweep that concatenates
what the view actually draws, in draw order, and asserts over the whole string —
no region may promise what another region denies, no region may leak a
diagnostic. 384 whole-card states.

> **A screen assembled from independently-correct parts is not an asserted
> screen.** If two functions render into one view, the assertion belongs on the
> concatenation. Correctness of the parts is not a property of the whole, and the
> gap between them is invisible to every test that respects the seam.

This is the third time this family has bitten (raw 424 body, then the offline
card and the false void promise, now this), and each time the previous fix was
correct and covered one renderer fewer than the screen has.

The same rule forced two view changes that no unit assertion would have caught:
`isVoided` (the owner ASKED) is not `the system cancelled it`, so the card
computes `voided = isVoided(b) && !isVoidRefused(b)` — otherwise ยกเลิกแล้ว with
the total struck through, over a bill the server still holds as live money. And
`notice.badge` now outranks the void badge, which is what makes that structural
rather than remembered.

## The mechanism was NOT symmetric, and assuming it was is the error

The brief for this work said the 403 "retries forever, feeds the poison counter,
and ends at a red ติดต่อฝ่ายสนับสนุน". Half right, and the half that was wrong
would have sent the fix to the wrong place. Measured, not argued (`proveForbidden`
F5, which runs the OLD mapping):

- **VOID path.** `VoidOutcome` has no `reachable` field, `markVoidAttemptFailed`
  touches neither poison column, and `assessQueue` reads only the SEND queue. So
  the poison counter never moved and no alarm ever fired. What happened instead
  was quieter and worse: `listVoidsToApply` has no backoff column and no time
  gate, so the void was re-POSTed on **every pass — 20 calls in 20 passes, every
  4 seconds, forever** — behind a card promising it was in hand.
- **SEND path.** Here the brief was exactly right: `reachable: true` drove
  `server_error_attempts` to 8 and raised the red "ติดต่อฝ่ายสนับสนุน" alarm over
  a permission no support desk can grant. This path is not reachable on today's
  server (`POST /bills` is open to staff) and was fixed anyway, because the
  transport maps 403 on both endpoints and fixing the instance instead of the
  class is what produced the 2c-7 amendment.

**Two paths that look symmetric can fail differently, and the difference is
whichever safety machinery each one happens to be wired into.** The void path had
no backoff at all — the very absence that made "retry forever" literal there and
harmless-looking on the send path. Check what each path is actually connected to
before assuming a shared cause; and when a brief names a mechanism, reproduce the
mechanism, not the conclusion.

## What "never retries" had to mean in code

Not a longer backoff. A backoff is a claim that time will help, and no amount of
time on this device changes a role:

- **VOID** — `void_refused_at` on the row takes it out of `listVoidsToApply`. Per
  bill, and that reverses the 401 lesson's "device-global, never stamped on a
  row" ON PURPOSE: an expired session says nothing about any bill, but this row is
  claiming something false about ITSELF, and a claim on a row must be corrected on
  the row, durably, across a restart.
- **SEND** — an in-memory `sendForbidden` flag on the engine gates the send loop.
  Device-global, not persisted: it is a claim about what the server said LAST, and
  a stored one would be a guess about next. A relaunch costs exactly one refused
  request, which is also the only way the app can ever learn the role was fixed.
- **Retraction** — a sign-in is the one event on this device that can change who
  is asking, so it is the only thing that lifts either. Same user signing back in
  costs one refused request, not a loop. **Known limit:** a role changed in the
  back office mid-session is invisible until the next sign-in; the token's TTL is
  one hour, so a shift re-asks at least hourly, and nothing else on the device is
  evidence about a role.

The client-side role gate (hide ยกเลิกบิลนี้ from staff, read from the token's own
`role` claim) **fails OPEN** on an unreadable token, which is the opposite of
[[config-defaults-must-fail-closed]] and belongs on the other side of the wire:
that lesson is about a SERVER accepting an identity it never verified. Here the
server re-reads the role from the users row on every request regardless, so the
gate prevents nothing — hiding the button from an admin whose token we merely
failed to parse would remove the only way to correct a wrong bill, while offering
it to a staff user costs one refused request and one plain sentence.

## Observed, on a real iPhone with a staff account

The device pass is what makes the rest of this more than a claim. One tap, then a
full minute untouched:

```
INFO:  192.168.1.243:54315 - "POST /bills/735ed2aa-.../void HTTP/1.1" 403 Forbidden
```

**One line. The last line in the log** — nothing else arrived for the rest of the
minute. Postgres, on that bill: `voided_at NULL`, `voided_by NULL`, `void_reason
NULL` (read as hex, per the codepage-874 footgun), `total_amount 220.00`, still
active as `B-2569-222`. The screen: red card, badge ไม่มีสิทธิ์ยกเลิกบิล, total NOT
struck through, no ยกเลิกแล้ว, no ติดต่อฝ่ายสนับสนุน, no sign-in prompt. Signing
back in as admin retracted the refusal and applied the ORIGINAL void with the
reason the owner had typed.

Note the asymmetry that is the design working: the server has no `void_reason`
because `require_admin` runs as a dependency and refuses before `void_bill` reads
the row. The reason lives on the PHONE, kept deliberately — the office needs to
know a cancellation was attempted on a bill the system still shows as live.
