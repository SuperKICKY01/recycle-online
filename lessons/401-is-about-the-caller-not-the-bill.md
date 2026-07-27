# A 401 is neither unavailable nor rejected: the request was fine, the CALLER is no longer anyone

Applies to every authenticated sync path. The send was well-formed, the server
answered promptly and definitively, and nothing about the payload is wrong —
but the token that identified us has run out. Classify that as either of the
existing failure classes and the app will tell the operator something false, in
one of two directions, decided by nothing more meaningful than how many bills
happened to be in the queue.

## What happened

`JWT_TTL_SECONDS` is 3600 and there is no refresh token, so on a long shift the
session simply ends. `httpTransport` mapped 401 into the catch-all with 5xx and
403: `{ kind: "unavailable", reachable: true }`. Every layer below then did
exactly what it was built to do, and produced two different lies:

| queued bills | what the machinery concluded | what the yard was told |
|---|---|---|
| 1 | `retryable > 0`, so App set `online = false` | **ออฟไลน์ — จะส่งให้เองเมื่อเน็ตกลับมา** |
| 3 | `reachable: true` ran `first_server_error_at` and `server_error_attempts` to `POISON_ALARM_ATTEMPTS` | **ติดต่อฝ่ายสนับสนุน** (red) |

The first says wait for signal. The network was fine — the server answered every
single request, which is precisely how we knew the token was dead. The second
sends someone to ring support about a jam nobody but the operator can clear.
**Neither names the fix, and the fix is one button.** Worse, the button did not
exist: the login screen renders on `token === null`, which is exactly false when
a token has expired rather than been absent.

## Why it fell through the existing classification

[[unavailable-is-not-rejected]] asks one question of every failed send:

> Can anything make this bill valid later — and does the failure name what?

That question has three answers there (unavailable / permanent / resolvable) and
it is the right question — for all three, because **all three are about the
bill.** A 401 is not about the bill. The bill is perfect; it goes through
untouched the moment someone signs in, which CASE 11d proves by sending the
byte-identical payload with the same idempotency key. The failure is about **the
caller**: we are no longer anyone the server will act for.

So the split was not too coarse this time, the way the two-way split had been.
It was measuring the wrong object. Ask the bill-question of a caller-problem and
every available answer is wrong:

- "nothing can make it valid" → terminal, and a perfectly good purchase is
  abandoned;
- "the outcome is unknown" → **false**. The outcome is known exactly;
- "master data is missing" → nothing the office can add will help.

**Rule.** Before choosing a failure class, ask *what the failure is about*: the
payload, the network, the server's state, or **the identity of the caller**. A
class that answers a question the failure is not an instance of will be wrong in
a way no amount of tuning fixes.

## The two properties that make this its own class

1. **It must not feed the poison alarm.** `first_server_error_at` and
   `server_error_attempts` exist to mean "the reachable server keeps refusing
   THIS BILL" ([[queue-jam-must-be-visible]]). A 401 refuses every bill equally,
   so it satisfies the letter of "reachable and refusing" while carrying none of
   the meaning. `markSessionExpired` clears both — a named store transition, not
   `markPendingAgain(reachable: false)`, because that parameter is documented as
   "did the server ANSWER" and for a 401 it did. Overloading it would have made
   the column lie about itself for the next person reading a metric off it.
2. **The message must carry its own action.** "Sign in again" is useless where
   there is no way to sign in, and the app's own login path was unreachable in
   exactly this state. The status strip now renders the button beside the
   sentence, and `StatusAction` pairs the label with the handler kind so the view
   cannot wire "ส่งอีกครั้ง" to the sign-in.

Do **not** solve this with refresh tokens. Re-login is the recovery for now, and
that is a decision, not an omission — but then the app owes the operator a
prompt and a button, which is the whole of this lesson's cost.

## Where it must NOT be applied

403. The MVP has no permission model, so a 403 from this server would be a
genuine surprise rather than a session that ran out; it stays `unavailable,
reachable: true`. And the transport's "no token at all" branch stays
transport-level — never having signed in is not the same event as being signed
out, even though the UI ends up saying much the same thing.

## Why every proof was green, again

For the same reason as [[correct-classification-can-still-render-as-an-error]]:
the wording lived in `app/StatusStrip.tsx`, and `app/` is unreachable from the
node program (`tsconfig.node.json` has `rootDir: "src"`). **Nothing that could
have failed existed.** The strip's ordered branch is now `src/sync/statusNotice.ts`,
which is the second time a rendering decision has had to move out of `app/`
before it could be trusted. Treat any operator-facing sentence still living
under `app/` as unproven by construction.

CASE 11 asserts the new behaviour AND runs the old classification alongside it
(`LegacyUnauthorizedTransport`, identical but for the union member it returns),
so the ledger shows `serverErrorAttempts=8, alarm=true, "ติดต่อฝ่ายสนับสนุน"`
next to `serverErrorAttempts=0, alarm=false, "ต้องเข้าสู่ระบบใหม่"` on the same
three bills. A green result is only evidence if you can see what would have made
it red.

## How to apply

1. Classify a failure by **what it is about** — payload, network, server state,
   caller identity — before deciding what to do with it. Add the class; do not
   stretch an existing one to fit.
2. Make the missed case a compile error: a new `SendOutcome` member breaks every
   `switch`, which is how the engine, both stores and the fakes were all found in
   one pass.
3. A signal that means "this bill is bad" must not be fed by a condition that is
   true of every bill. If a counter would fire identically for all of them, it is
   measuring something else.
4. Session state is **device-global and derived**, never stamped on a row. The
   token lives in memory, so a stored per-bill "session expired" flag outlives
   its own truth the moment someone signs in.
5. Clear the queue's backoff on sign-in. Every delay on it was computed while
   there was no session, which was never a fact about the network — without that,
   signing in appears to do nothing for up to 30 seconds.
6. Bills stay queued, intact, in weighing order, with the same idempotency keys.
   An expiry must cost the yard nothing but a tap.
