# Two green proofs do not cover the seam between them

**Applies to** any behaviour a user meets that passes through more than one
proven component — and to every claim of the shape "X is proven, and Y is
proven."

**The rule:** two components proven separately are not a proven composition. The
next defect is at the seam, because the seam is the one place no proof file
owns. Find it by asking which proof drives BOTH sides — and when the answer is
"none", that is the finding, not a gap to note and move past.

## The strongest instance this repo has

Two proofs, both green, both correct:

- **`mobile/src/proof/proveSync.ts:1184`**, `case11SessionExpired` — the session
  expires with bills queued. It covers a 401 arriving mid-queue on both stores,
  including a deliberate disproof (11a-legacy, 11c) driven by
  `LegacyUnauthorizedTransport` to show the old classification told the operator
  one of two false things.
- **`mobile/src/proof/proveSignOut.ts`**, S1 — a non-empty send queue refuses the
  sign-out and names the count.

Neither is wrong. Neither is weak. And they cannot see each other:

```
grep -n "signOut" proveSync.ts      ->  0 matches
grep -n "401"     proveSignOut.ts   ->  0 matches
```

Run both ways, both zero. `proveSync` knows everything about a dead token and
has never heard of sign-out. `proveSignOut` knows everything about the sign-out
gate and has never heard of a 401. **The composition of the two is driven by
nothing.**

## What lives in the gap

Observed on a real iPhone, 2026-08-06, recorded in `OPEN_ITEMS.md` under the
entry opening **"The sync strip says the phone is OFFLINE while the server is
refusing its token"** — cited by its first sentence rather than by a line range,
because that file grows and a range goes stale silently. A bill queued, the
session revoked from the PC, Wi-Fi at full strength. Over three
minutes the bill cycled `รอส่ง` → `กำลังส่ง` → `รอส่ง` and never sent. Two
sentences were on the screen at once, both false:

```
sync strip : ออฟไลน์ — เก็บไว้ในเครื่อง 1 ใบ จะส่งให้เองเมื่อเน็ตกลับมา
             ("offline — will send by itself when the network comes back")
sign-out   : ยังออกจากระบบไม่ได้ / มีบิลรอส่งขึ้นระบบ 1 ใบ /
             รอให้ส่งครบก่อน แล้วจึงออกจากระบบได้
             ("wait until they are all sent, then you can sign out")
```

The network was up. The queue could not drain, because the token was dead. So
the strip promised a recovery that was not coming, and the sheet instructed the
operator to wait for a condition that could never arrive — on the one device
holding an unsent bill, with the one action that would fix it (sign in again)
refused by the gate. **A third renderer on the same build, in the same minute,
got it right**: the daily money screen drew `ต้องเข้าสู่ระบบใหม่` with a working
sign-in button.

> **CORRECTION, 2026-08-07 — HALF OF THE INSTANCE ABOVE DID NOT HAPPEN, and the
> half that did is worse for it.** The strip line is struck. Restaged on the same
> handset with the transform cache cleared and the bundle reloaded, the strip drew
> `หมดเวลาเข้าใช้งาน — ต้องเข้าสู่ระบบใหม่ บิล 1 ใบยังอยู่ครบ จะส่งให้เองหลังเข้าสู่ระบบ`
> with a working sign-in button, and held it for five minutes. **`statusNotice.ts`
> classified the 401 correctly the whole time**; the `ออฟไลน์` reading came from a
> stale bundle and is not a property of any committed code — see `CLAUDE.md §
> Machine footguns`, the Metro transform-cache entry. What remained was the sheet
> alone, and that is the sharper finding: there was never a deadlock. The exit
> existed, two centimetres up the same screen, working, and pressing it posted the
> bill immediately. The sheet could not see it because it had no input for WHY the
> queue was stuck. Fixed and proven in R2b; the rule it produced is the R2b
> amendment to [[correct-classification-can-still-render-as-an-error]].
>
> **What this lesson claims is unharmed, and was confirmed by being acted on.** The
> two greps below were the whole argument and neither depended on the strip. The
> seam test prescribed in *How to test for it* was then written —
> `proveSignOut.ts` S9, driving both sides in one run and asserting negatively on
> the rendered composition — and it found a real defect that both green proofs had
> been unable to see. A lesson whose remedy was executed and paid out.

Each half is defensible alone. The queue really is blocked; bills really are
pending. The trap only exists once both are true at the same time, and no proof
puts them there together.

**The cause is NOT settled and this lesson does not settle it.** `OPEN_ITEMS.md`
names two candidates with different fixes and deliberately accepts neither; the
diagnosis is running in its own read-only session. What is established here needs
no cause at all: the two greps above are the whole argument, and they were true
before anyone opened `engine.ts`.

## Why "both are proven" is the seduction

The seam is invisible from every position that could report it:

- **Each proof file's coverage looks complete from inside itself.** `proveSync`'s
  case 11 has a disproof arm; that is a proof written by someone being careful,
  and care applied within a boundary does not cross it.
- **No file is missing.** There is no empty test to notice, no `TODO`, no
  skipped case in a summary. The count of green cells goes UP as each component
  is proven harder, and the seam does not appear in that count.
- **The failure needs two subsystems in one state,** which is exactly the state a
  unit proof is designed to avoid constructing.

This is the wider form of what
[[correct-classification-can-still-render-as-an-error]] already carries: there,
one card drawn by two renderers, 448 green cells, and the defect in the
CONCATENATION. The difference is the boundary. There the composition sat inside
one screen that one proof could reach; here it spans two subsystems whose proof
files do not share a single identifier. The remedy there — *assert the
concatenation in draw order* — presumes you know where to look. This lesson is
about finding that place first.

## How to test for it

1. **Name the components a user-visible behaviour passes through.** For this one:
   transport classification → store transition → queue health → sync strip →
   sign-out gate → sheet wording. Six, across two proof files.
2. **Grep each proof for the other's vocabulary, both directions.** Zero matches
   both ways is an unproven seam, and it is a two-second measurement. Do it for
   every adjacent pair, not just the pair you suspect.
3. **Write one case that drives both sides in a SINGLE run** and asserts what the
   operator ends up looking at — the rendered text, in draw order, from a state
   reached by real transitions rather than assembled by hand
   ([[a-proof-fixture-must-be-a-row-the-product-could-produce]]).
4. **Assert NEGATIVELY on the composition.** "The strip does not promise a
   network recovery while the session is dead" is the claim. Both components pass
   every positive assertion already; only a negative one over the pair can fail.
5. **Give the seam test a home.** It belongs to neither component's file, so it
   will not be written unless something owns compositions explicitly. A test that
   has no obvious file is the test most likely never to exist —
   [[a-check-that-never-went-red-was-never-observed]] is about cells that cannot
   fire; this is about the case that was never written, which is the same blind
   spot one step earlier.

## The general form

**Ask of any two components: what does the user see when both are in their
unhappy path at once?** Proof coverage is measured per file and defects are not.
Every subsystem boundary in this project — transport/store, store/health,
health/screen, gate/sheet — is a place where two correct halves can compose into
a screen that lies, and no amount of proving either half harder will reach it.

## AMENDED 2026-09-06: eighty-one green proofs, and an app that could not open

The seam can sit BELOW every proof file. On 2026-09-06 every proof in this
repository — 31 server, 50 mobile — ran green twice under one instrument
(`tools/prove_all.py`), and the debug build of the app died at startup on every
launch: `java.lang.NoSuchMethodError … getDirectConverter` inside `expo-font`'s
native module registration. Cause: `@expo/vector-icons@15.1.1`, added
2026-09-01, hoisted `expo-font@57.0.2` to the top of `node_modules` while
`expo@54.0.36` kept the `expo-font@14.0.12` it needs nested underneath; Expo's
autolinker compiles the top one, against an `expo-modules-core` API the installed
3.0.30 does not have. Every device build from that tree since 2026-09-01 would
have crashed identically. None had been made, so nothing saw it.

Why no proof could: the headless suite runs node against `dist/` and Python
against Postgres. Not one of the 81 links a native module, resolves the Android
dependency graph, or starts the app. The two proven sides are "the JS and the
server behave" and "the native project builds"; the seam is the RUNTIME LINK
between the compiled native modules, which no file owns. The green count went UP
across 0019 and 0020 while the app was unopenable — the same shape as the
sign-out instance above, one layer down, where the components are not two proof
files but two toolchains.

The instance was caught only because an emulator was stood up for another
reason. What would catch it next time is filed with its trade-off in
`OPEN_ITEMS.md § Verification gaps — built, not proven` (the entry on the
headless suite and native dependencies): the cheap half — `npm ls` must show ONE
resolved version of every `expo-*` package — is seconds and would have caught
this conflict; the honest half — the app STARTS on an emulator — is minutes and a
running AVD, and is the only check that sees the runtime link. Which of them
`prove:all` carries is the owner's decision, and this amendment does not make it.
