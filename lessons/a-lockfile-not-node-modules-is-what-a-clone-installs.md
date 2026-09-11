# A green suite runs against the node_modules you HAVE, not the lockfile a clone installs from

**Applies to** adding a workspace member, a local `file:` dependency, or anything
present in your `node_modules` by a means the lockfile does not record — a hand-made
symlink or junction, a leftover from a past install, a manual `npm link`. A proof
suite resolves modules from the `node_modules` you HAVE. `npm ci` and a fresh clone
build `node_modules` from the LOCKFILE. When the two disagree, a green suite proves
the code works on THIS box and says nothing about whether a clone can even resolve
the package.

**The rule.** A new workspace member — or any locally-linked dependency — is not done
until the LOCKFILE records it. Register it with `npm install` (which writes the
lockfile), never a hand-made link alone, and read `git diff -- <lockfile>` to confirm
exactly that member's entries appeared and NOTHING else moved. The lockfile, not
`node_modules`, is what a clone and CI reproduce; the question "does a clone resolve
this?" is answered by the lockfile, and grepping it needs a positive control (an
existing member) in the same invocation so a zero is distinguishable from an
instrument that never looked.

**Measured 2026-09-10/11** (STRUCTURE.md § 12 unit 4 commit 3, the PromptPay payload).
Commit 3's first turn created the package `@recycle/promptpay` and linked it into
`node_modules/@recycle` with a HAND-MADE junction — to avoid a lockfile edit that a
self-contradicting brief forbade (the brief ordered a new `packages/` member and
fenced the lockfile in one document). `prove_all` then ran GREEN over 83 proofs and
both typechecks were green — every one resolving the package through that junction.
But the lockfile did not record it: `grep "shop-time\|promptpay" package-lock.json`
returned the four `shop-time` entries (the positive control) and NOTHING for
`promptpay`. So `npm ci` or a fresh clone would not have linked `@recycle/promptpay`,
and the mobile build — which imports it — would have failed to resolve it. The green
suite had measured this box's `node_modules`, not a clone's. The closing turn ran
`npm install` at the root, which added exactly two lockfile entries (a
`node_modules/@recycle/promptpay` link and a `packages/promptpay` member, mirroring
`shop-time`); `git diff --numstat` read `8 0`, and no other package's `version`,
`resolved` or `integrity` moved.

**Why the existing lessons do not quite reach it.**

- [[two-green-proofs-do-not-cover-the-seam]]'s native-dependency amendment is the
  nearest — "a green suite is not evidence the app STARTS." Same family (a green suite
  over a state that does not deploy), but a different mechanism: there a wrong native
  version was PRESENT and linked at runtime; here the package is ABSENT from a clone's
  tree entirely, and the failure is at build/import, not startup.
- [[a-check-that-never-went-red-was-never-observed]]'s fifth mechanism is "the right
  instrument pointed at the wrong object." That is the shape here — a correct suite ran
  against the wrong `node_modules` (this box's, with the hand-made link). But its
  remedy is "point the instrument at every source"; here the remedy is to make the
  OBJECT the one a clone builds — record the member in the lockfile so `node_modules`
  is reproducible.

**How to apply.**

1. Register a workspace member or local link with `npm install`, which writes the
   lockfile — never a hand-made symlink or junction on its own.
2. Read `git diff -- <lockfile>` and confirm ONLY the new member's entries appeared (a
   link entry plus a member entry, mirroring an existing member). Any other package's
   `version`/`resolved`/`integrity` moving is a separate change to revert.
3. To ask whether a clone resolves the package, grep the LOCKFILE, not your
   `node_modules`, with a known-present member as a positive control in the same
   invocation.

**Two homes, one test.** A LESSON, not a machine footgun: `npm ci` installing strictly
from the lockfile is npm's documented behaviour on every machine, and a session on any
box would relearn it. Nothing here is a property of this box.

**Bounds.** Measured once, on one workspace member, in this repository. The mechanism —
a suite green over a `node_modules` the lockfile does not reproduce — is general and
carries the lesson.
