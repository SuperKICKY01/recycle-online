# Project status

Where the work has actually got to. CLAUDE.md holds the static
infrastructure — architecture, hard rules, machine traps, workflow —
and says nothing about progress; everything that moves as phases land
is here.

Update this file at every phase boundary. Nothing enters it that has
not been OBSERVED: a proof that ran, an endpoint that answered, a
screen seen on a device. Implemented is not verified, and a dated
green in here is only as fresh as its date.

`BRIEFING.md` is the fresh-session handoff (architecture, invariants,
lesson shapes). It deliberately holds NO status — update it when
architecture or a hard rule changes, not at every phase boundary.
`OPEN_ITEMS.md` holds everything outstanding, one line each.
`ROADMAP.md` holds the ORDER of what is not done, and why that order.

**THIS FILE IS NOT SPLIT, and the trigger for reconsidering that is written
here so it does not live only in a conversation. Revisit at 2000 lines.**
Splitting "Earlier phases" and "Baseline observations" into a `HISTORY.md` was
considered on 2026-08-06 and REJECTED. The reason is the rule three lines
above: Baseline observations is not an appendix, it is the evidence layer every
claim in this file rests on. Move the dated greens out and what remains is a
file of assertions whose freshness is invisible from where the assertions are
written — and a fresh session reads this file first, because CLAUDE.md names
it and would not name the other. The measured saving did not justify that:
the two sections were 543 of 1457 lines, and removing them would still have
left a file too large to read in one call. **Compress in place instead** —
superseded entries reduce to their finding plus a pointer, which is what was
done to two of them on 2026-08-06.

**SUPERSEDED 2026-08-28 (M2 c3): the file IS now split — this active file plus a
cold `archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md` — and the 2026-08-06
decision is ANSWERED, not dismissed.** The trigger it set fired hard: measured
9,251 lines, **4.63x** its own 2,000-line revisit threshold. The reason it gave —
Baseline observations is the evidence layer every claim rests on — is honoured
exactly: a dated green a CURRENT claim rests on STAYS beside that claim (the
2026-08-06 R1b/R2 device pass and five entangled baselines were kept here); only
CLOSED phases and the greens for closed work moved, carrying their greens with
them. The freshness objection is met because the archive is in the repo, named
here and reachable, and the active file is now readable in one pass. Standing
convention (as at ROADMAP): an entangled entry compresses LATER, when its live
anchor closes — history leaves with its entry, never carved out while live.

**PHASE NUMBERING, settled 2026-08-05.** The **A-numbers in this file
are a CLOSED LOG** — A1 (daily money view, mobile screen) and A2
(reconciliation), both complete. They stay as written because commit
bodies point at them (`27a0453`: "the A1 device pass", "a SECURITY item
for A3"), and renaming them would orphan the history. **No new A-number
will be issued.** Forward work is numbered R1, R2 … in `ROADMAP.md`.
A3 was never opened; the sign-out work it named is **R1**.

**Last updated: 2026-08-06 — R1 AND R2 BOTH CLOSED. A phone can end its session
deliberately, and the server can refuse a token it already issued
(`users.token_version`, migration 0005) — both halves observed on a real
handset. The daily money screen's last two device gaps are closed, the 403
rendering on strong evidence and the hung socket on weaker evidence that is
labelled as such. NO PHASE IS OPEN. One finding from the pass is UNDIAGNOSED
and deadlocks a handset whenever a token expires mid-shift; see Current
phase.**

**Also 2026-08-06, DOCUMENTATION ONLY: three further commits landed —
`b955697` (the lessons generator), `b74396e` (`START_HERE.md`, and two workflow
rules that existed nowhere in the repo before that day), and the citation change
below. NONE OF THEM TOUCHED CODE, so no proof and no typecheck was run for any of
them. Every dated green in Baseline observations keeps its own date and none is
refreshed by this work — a reader seeing three commits after the last green must
not read the green as re-run.**

## Current phase

**MAINTENANCE — M0: THE REPOSITORY NOW HAS OFF-MACHINE COPIES. 2026-08-28.**
Infrastructure maintenance, not a product P-number; it supersedes the P1.8b
block below ONLY as the current-phase pointer — that record stands, and P1.8b's
handset and scratch-DB passes remain owed. At session start `git remote -v` was
EMPTY and all 233 commits (two branches) existed on the E: drive alone. Two
independent off-machine copies now exist, both verified:

- **A `git bundle --all`** on a different physical drive (C:):
  `C:\Users\PC\recycle-online-backup\recycle-online-all-2026-08-28-2d9e0f1.bundle`.
  `git bundle verify` → "The bundle records a complete history … okay", exit 0;
  4,417,784 bytes; sha256
  `32f0b38caa28eee2a6d6b82bee903183340f967c242b212031f7504607dc19ba`; refs
  `main`, `worktree-architecture-d4-correction`, `HEAD`. It lives OUTSIDE the
  repo by design; this line only records where it is.
- **A PRIVATE GitHub repository**, `https://github.com/SuperKICKY01/recycle-online`,
  created under the authenticated `gh` account (`SuperKICKY01`, matches the git
  user). `git push origin --all` pushed both branches; `git ls-remote origin`
  matches the local refs exactly. No secret is exposed — only `.env.example`
  files are tracked, so `server/.env` and `JWT_SECRET` are absent from both the
  bundle and the push.

The two maintenance commits (this M0 record, and M1's restructure) are NOT yet
on the remote — they land there after the owner reviews this boundary.

**MAINTENANCE — M1: CLAUDE.md COMPACTED; ITS INCIDENT PROSE RELOCATED TO
EVIDENCE.md. 2026-08-28.** No rule's content changed — relocation and
compression only, verified below. Files: CLAUDE.md, EVIDENCE.md, START_HERE.md,
and these PROJECT_STATUS lines.

- **Boot load, before/after (`wc -l`/`wc -c`, Bash tool).** CLAUDE.md 801 → 324
  lines, 48,640 → 20,270 bytes — **58% lighter, the real measure** (bytes track
  tokens; the narrative moved to EVIDENCE.md, which is fetch-on-demand and grew
  by 3,204 bytes). Boot set (CLAUDE.md + START_HERE.md + lessons/README.md)
  1029 → 555 lines. The ≤550 line-target is 3 over: the residual is structural —
  lessons/README.md's 66 lines are out of this phase's scope, and START_HERE
  gained a two-line EVIDENCE.md pointer a booting session needs. Line count is a
  proxy; inlining pointers would drop lines without dropping tokens, so it was
  not done.
- **Where the prose went.** The 13 machine-footgun entries, the boot-check
  incidents and the workflow/convention stories were compacted to
  symptom + remedy + a `→ EVIDENCE.md §` pointer; every rule and every remedy
  COMMAND stayed in CLAUDE.md, and the narrative moved to EVIDENCE.md — existing
  per-rule sections, plus two NEW ones minted here (`§ grep -iF Aborted: the
  locale split and the false zeros`, `§ Co-Authored-By: the trailer census`). An
  independent read-only pass confirmed no actionable rule lost; it found one
  dropped remedy command (the Out-File first-byte `BitConverter` check), restored
  before this commit.
- **The owner's file-set amendment.** The brief named two NEW files
  docs/FOOTGUNS.md and docs/CONVENTIONS.md as the narrative's home; a read of the
  tree showed EVIDENCE.md (committed `1d58899`) already IS that home, with 13
  inbound `→ EVIDENCE.md §` pointers. The two files were WITHDRAWN by the owner
  and EVIDENCE.md moved into the file set; docs/ was never created. This is
  `CLAUDE.md § Workflow` "A REPORT IS A CLUE" working — the brief's premise was
  re-measured against the artefact before any edit.
- **Citation integrity (`tools/verify_citations.ps1`, call operator + array, 14
  sources).** BROKEN was 8 before AND 8 after — zero new breaks; the 8 are
  pre-existing and target files this phase did not touch. The shared-checks block
  is byte-identical (`verify_shared_checks.py` IDENTICAL, exit 0), and
  `build_all_lessons.py --check` exits 0. The code trees (mobile/server/packages/
  desktop/tools) `git status --porcelain` is empty, so both mobile typechecks are
  unaffected. One mistake, caught by the checker: two cited handles wrapped across
  two lines during compaction — exactly what `CLAUDE.md § Conventions`
  "The target end is the harder one" warns of — re-wrapped, BROKEN back to 8.
- **IS A LESSON OWED? NO, BY `CLAUDE.md § Workflow` "Two homes, one test".** Both
  mistakes were of an already-documented class — the handle-wrap is that same
  pin-a-claim rule, and catching the brief's wrong destination premise is
  `CLAUDE.md § Workflow` "A REPORT IS A CLUE". Nothing new to relearn.

**MAINTENANCE — M5: THE THREE UNTRACKED ROOT FILES, SETTLED. 2026-08-29.** The
owner's decision on `ARGUS_MOBILE_READ.md`, `COMMIT_MSG.txt` and
`UNCOMMITTED_DOCS.diff`, all untracked since 2026-08-10/17 and left alone by every
brief since. **The two deletions are of UNTRACKED files, so they never enter the
git diff — this record is their only trace, which is why it carries the
measurement.**

- **`COMMIT_MSG.txt` — DELETED, measured spent.** It was the drafted message for
  the add-seller Modal fix, and that fix LANDED as commit `1204081` (2026-08-17,
  16 files, +2602). `diff` of the file against `git show 1204081 -s --format=%B` is
  a single trailing blank line (`199a200`) — otherwise byte-identical. Deleting it
  lost nothing git does not already hold.
- **`UNCOMMITTED_DOCS.diff` — DELETED, measured spent.** A 2026-08-10 diff across
  six doc files (ARCHITECTURE, CLAUDE, OPEN_ITEMS, PROJECT_STATUS, ROADMAP,
  lessons/README). `git apply --check` FAILS — the tree already holds every hunk;
  confirmed by presence today of ARCHITECTURE's password-route appendix, CLAUDE's
  pin-a-claim convention, and the "enumeration decays" / "holds nine skills" lines.
  The M0–M4 reworks relocated some of it (e.g. into EVIDENCE.md), which is why the
  diff no longer applies; the content is in.
- **`ARGUS_MOBILE_READ.md` — MOVED to `research/`, NOT deleted.** A raw argus
  code-read dump (2026-08-10) whose own first line disclaims being a repo document;
  its size measurements are rotted and its Q1–Q6 readings are re-derivable from the
  source they cite. It was MOVED rather than deleted because the sampling read
  (head/middle/tail, not all 292 lines) could not GUARANTEE zero unique
  observations, and an artifact outside the repo is one cleanup from gone — 35 KB
  inside the tree is the cheap side of that bet. It joins the four research reports
  already tracked under `research/`, with a one-line header marking it a moved,
  rotted snapshot of the shas it names. My "research lives outside the repo" memory
  was stale and is retired.

No queue line closed — `OPEN_ITEMS.md` names none of the three. **IS A LESSON OWED?
NO, by `CLAUDE.md § Workflow` "Two homes, one test"** — each disposition applied a
recorded rule (spent work measured before deletion; a research artifact kept inside
the tree rather than left to rot outside it), and nothing new was relearned.

**P1.8b OFFLINE SELLER CREATION — THE CONTINUOUS RESERVE STRIP, THE LAST CODE
PIECE (commit 2 of 2). DONE 2026-08-28.** This supersedes the commit-1 entry below
as the current phase; that record stands. **NO SHA IS GIVEN**, deliberately — the
work is uncommitted at the moment this is written
(`CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT"). With it, **P1.8b's DONE WHEN
has NO CODE left**: what remains is the handset device pass and the scratch-DB
server pass, both needing the owner and live infrastructure.

**WHAT IT BUILT.** The reserve level is shown CONTINUOUSLY, so exhaustion is
legible before it bites. `topUpReservations` (`engine.ts`) now CAPTURES
`refillOnce`'s answer — which it used to DISCARD — and persists the shop's TARGET,
the one input the level needs that the device cannot know locally, to a new one-row
`local_reserve` table (`spendable` and `held` are LOCAL counts). A third always-on
strip, `app/ReserveStrip.tsx` on the StatusStrip/MasterDataStrip pattern, renders
`src/master/reserveStrip.ts`.

- **The four states, and one is suppressed.** `never_provisioned` and `exhausted`
  are target-INDEPENDENT and exact from the local holding; `low` shows the true
  count; `ample` renders NOTHING — the calm state, as MasterDataStrip suppresses
  fresh data. c4's `reserveNotice` supplies the sentences. RED CELLS, named before
  the run: `--break=amplenull` reddened exactly the three `ample`→null cells.
- **`never_provisioned` shows NO NUMBER.** A device that has spent nothing has no
  count, and a zeroed target is never invented (`fallback-default-is-a-wrong-number`):
  the row is null and the strip is asserted to carry NO DIGIT.
- **A LEVEL READ IS AN AGE CLAIM, and a stale target is not sold as fresh.** The
  target arrives only in a refill answer and a refill is a no-op offline, so it can
  be stale; `target_at` records when it arrived. Only `ample` asserts anything about
  the target, so past a 12h cutoff — its OWN constant, `freshness.ts`'s
  anti-conflation rule forbidding reuse of the money one — or when the stamp is in
  the future (a backwards clock, `pastStampSuspect`), the strip never claims
  `ample`; it shows the count. RED CELLS: `--break=truststale` reddened exactly the
  five staleness cells. This is `cached-master-data-is-a-price-claim`'s shape
  applied to a level.
- **THE SEAM NO PROOF HAD EVER DRIVEN.** No proof drove `SyncEngine.runOnce` — the
  refill call site — so `topUpReservations` had never run under a proof, which is
  the gap the commit-1 "callerless" confusion lived in. `proveReserveStrip`'s
  integration cell drives a real engine over real SQLite: `runOnce` persists the
  target, an offline pass leaves the last-known one, and the read-back state feeds
  the strip.

**THE OBSERVATIONS, every command bare with its status read in the same
invocation. No server, no device.**

- Both TypeScript programs exit 0, each bare, before and after.
- `npm run prove:reservestrip` (new, 29 cells, incl. the engine-seam cell) exit 0
  TWICE, own fixture per run (a fresh temp DB, closed before deletion — Windows
  refuses to unlink a file SQLite holds open), preset-red. Both disproofs named
  their cell before running.
- Every headless mobile proof green TWICE, cell counts identical to the commit-1
  baseline and UNMOVED — 34 of them, including `proveSync` 247, `proveOutbox` 77,
  `proveSellerKind` 69, `proveSellerStore` 56, `provePickerSeller` 15,
  `proveReserveNotice` 20, `proveLocalSellerCreate` 27. The three auth proofs exit
  1 ONLY for want of a live server — out of scope, untouched.
- `verify_shared_checks.py` 0; `build_all_lessons.py --check` 0 (no lesson added).
- Citation checker over the three edited docs: BROKEN unchanged from commit 1's six
  pre-existing, and every citation this phase added resolves.

**FILE SET.** New: `mobile/src/master/reserveStrip.ts`,
`mobile/app/ReserveStrip.tsx`, `mobile/src/proof/proveReserveStrip.ts`. Edited:
`mobile/src/adapters/sqlite/schema.ts`, `mobile/src/sync/localSeller.ts`,
`mobile/src/adapters/sqlite/SqliteLocalSellerStore.ts`, `mobile/src/sync/engine.ts`,
`mobile/App.tsx`, `mobile/package.json`, `mobile/src/proof/fakes.ts`;
`PROJECT_STATUS.md`, `ROADMAP.md`, `OPEN_ITEMS.md`.

**WHAT STAYS OPEN — NO CODE.** The handset device pass (the sheet and the strip
read on a phone, reported verbatim in Thai, under
`CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING") and the scratch-DB
server pass (a released bill reaching a real `POST /bills` with the
`doc_no_counters` row MOVING). Both need the owner and live infrastructure; neither
is code. Recorded in `ROADMAP.md § P1.8`'s partition and `OPEN_ITEMS.md`.

**IS A LESSON OWED? NO, BY `CLAUDE.md § Workflow` "Two homes, one test".** The two
things this phase surfaced are instances, not new lessons. The runOnce-never-driven
seam is `two-green-proofs-do-not-cover-the-seam` — `refillOnce` and the store were
each proven and their assembly in `topUpReservations` was not — closed by driving
the real path. The Windows EPERM on deleting an open SQLite temp dir is the
established proof pattern already (`await driver.close()` before `rmSync`, as
`proveSellerStore` does) and a clear error, not a wrong diagnosis — no footgun.

**DEVICE PASS 2026-08-28 — THE HANDSET HALF OF P1.8b's DONE WHEN IS EXERCISED
END-TO-END, AND THE STEP STILL DOES NOT CLOSE.** Recorded from a read-only
re-derivation of the dev cluster (`recycle` on 5544, cross-tenant reads as the
`postgres` superuser under FORCE RLS); this session wrote nothing to any database.
On 2026-08-28 a seller created OFFLINE on a handset reached the server, and a bill
weighed against it synced.

- **A seller was created offline under a reserved code.** Seller `S008`
  (id `5c142ef3`, name the ASCII placeholder `ggghh`) reached the server bound to
  reservation `S008`, whose `seller_code_reservations` row is now `state=spent` with
  `seller_id` set — the offline reserved-code path this phase built, not the removed
  online mint. Codes `S009` through `S028` sit `held`, the 20-code reserve strip.
- **A bill weighed against it synced.** `B-2569-543` — one `AL-CAN` line, net 2.000,
  total 40.00 — carries a server-assigned doc_no, and Shop A's `doc_no_counters` row
  for be_year 2569 reads `last_seq=543`, the counter that names the bill.

**WHICH PART OF P1.8b's DONE WHEN THIS SATISFIES, AND WHICH IT DOES NOT — partition
re-derived from `ROADMAP.md § P1.8`.** The UX-rework item (P1.23), the startup-sweep
item and the offline-creation-wiring item are already closed at their own entries.
Of the two that remained:

- **The handset device pass** is exercised end-to-end on the SERVER/DB side —
  offline creation, reserved-code spend and bill sync are all confirmed against the
  live server. What this documentation session does NOT itself carry is the other
  half of that criterion: the sheet and the strip read on a phone and reported
  VERBATIM IN THAI under the bundle and server attestations
  `CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING" requires. That
  evidence belongs to the device pass's own record, is not re-derivable from
  Postgres, and is not asserted here.
- **The scratch-DB server pass STILL DOES NOT.** That clause names a run staged once
  on a SCRATCH database, because each run burns reserved code space permanently; this
  pass ran on the dev cluster and ran no such staged proof. A bill did reach
  `POST /bills` with the counter moving, but the criterion's cost — once, on
  scratch — is unmet.

**SO P1.8b IS NOT DONE.** One clause is open — the scratch-DB server pass — and the
device-screen half of the handset pass is attested by the device pass's own record,
not here. The block this pass also hit — a NULL-grade seller parking the bill until
an admin set the shop default by curl — is recorded at
`OPEN_ITEMS.md § Blocking one real paying shop`. **Bounds:** one handset, one tenant,
the dev database, a debug build, one operator.

---

**P1.8b OFFLINE SELLER CREATION — WIRED (commit 1 of 2). DONE 2026-08-28.** This
supersedes the P1.23 c4 entry below as the current phase; that entry's record
stands unchanged apart from the dated `refillOnce` correction appended to it.
**NO SHA IS GIVEN**, deliberately — the work carrying this sentence is uncommitted
at the moment it is written (`CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT").
It closes the sixth partition item of P1.8b's DONE WHEN — offline creation is
wired — leaving the reserve strip (commit 2), the device pass, and the scratch-DB
server pass.

**WHAT IT BUILT.** The add-seller sheet writes LOCAL-FIRST, ALWAYS (hard rule 8;
the ONE mechanism S14 asks for, not two): every create writes a `local_sellers`
row binding one reserved code and enqueues the `seller_create` kind, which drains
immediately when online. This SUPERSEDES P1.8a's direct-online path — the online
`SellerApi` mint client is REMOVED, not run beside it.

- **Creation spends a reserved code, and exhaustion is a real branch.** `App.tsx`'s
  `createSeller` calls `SqliteLocalSellerStore.createLocalSeller` (already proven
  by `prove:sellerstore` S4: binds a code, spendable drops by one, and with the
  holding empty REFUSES by cause — `no_code`, no fourth row). The refusal is shown
  BY CAUSE with c4's own `exhausted`/`never_provisioned` wording, derived from
  `held` with no invented `target`: `master/localSellerCreateNotice.ts`, proven by
  the new `prove:localsellercreate`. RED CELLS, cell named before each run:
  `--break=collapse` (render a never-provisioned device as exhausted) reddened
  C4's two direction cells, C5's two and C6's equality — 5, exactly the
  never-provisioned family; `--break=leak` (append the reservation token to a
  created card) reddened EXACTLY C1's no-leak cell and NAMED the value leaked.
- **The created local seller flows through the c3 send-time resolution.** It is
  offered under its LOCAL id (`localSellers` state, the union side, never the
  cache), a bill weighed against it parks, and `resolveParkedSeller` swaps in the
  server id once it settles — the ROUTE `prove:pickerseller` R1–R4 already proves
  by the branded `ResolvedSellerId`, unchanged and green.
- **The code field is gone from the sheet.** A reservation supplies the code, so a
  code field would be a dead input (`master/sellerForm.ts`, `localSellerDraftFrom`
  → `LocalSellerDraft`). No grade field either (D1, unchanged).
- **The online mint path is removed.** `master/createSeller.ts` (`SellerApi`),
  `master/sellerCreateNotice.ts`, and their proofs `proveSellerCreate` (live
  server) and `proveSellerNotice` are deleted; every reference in six kept files is
  restated standalone. P1.8a's DONE WHEN was met AS WRITTEN by the online path
  (recorded in `ROADMAP.md § P1.8`, unchanged); its live-server proof retires with
  the mint path it proved. The new path meets the same criterion — a staff session
  creates a usable seller from the handset — by the local-first mechanism, whose
  HEADLESS half is proven here and whose server round-trip is the scratch-DB pass,
  already owed.

**THE OBSERVATIONS, every command bare with its status read in the same
invocation. No server, no device.**

- Both TypeScript programs exit 0, each bare (`npm run typecheck`,
  `npm run typecheck:app`), before and after the stale-reference sweep.
- `npm run prove:localsellercreate` (new) exit 0 TWICE, own fixture (pure — no
  store, no reseed), preset-red at entry. 27 cells.
- Every headless mobile proof green TWICE, real exit code, cell counts identical to
  the c4 baseline and unmoved by this phase — 33 of them, including `proveSync`
  247, `proveOutbox` 77, `proveSellerKind` 69, `proveParkedBill` 58,
  `provePickerSeller` 15, `proveReserveNotice` 20, `proveSellerStore` 56. The three
  auth proofs (`prove:login`, `prove:loginscreen`, `prove:forbidden` F6) exit 1
  ONLY for want of a live server (`fetch failed`, unreachable) — out of this
  headless phase's scope and untouched by the change; `prove:forbidden`'s offline
  cells passed.
- `verify_shared_checks.py` 0; `build_all_lessons.py --check` 0 (no lesson added).
- Citation checker over the three edited docs, call operator with an array:
  `SOURCES=3  CITATIONS=447  BROKEN=6` — all six BROKEN pre-existing (none in a
  line this phase added, measured against the diff; no heading was added, so none
  rose), and every citation this phase added resolves.

**FILE SET.** New: `mobile/src/master/localSellerCreateNotice.ts`,
`mobile/src/proof/proveLocalSellerCreate.ts`. Deleted:
`mobile/src/master/createSeller.ts`, `mobile/src/master/sellerCreateNotice.ts`,
`mobile/src/proof/proveSellerCreate.ts`, `mobile/src/proof/proveSellerNotice.ts`.
Edited: `mobile/App.tsx`, `mobile/app/AddSellerSheet.tsx`,
`mobile/src/master/sellerForm.ts`, `mobile/package.json`; the stale-reference
sweep in `mobile/app/api.ts`, `mobile/src/sync/localSeller.ts`,
`mobile/src/sync/sellerCreate.ts`, `mobile/src/adapters/httpSellerTransport.ts`,
`mobile/src/master/saveConfirmNotice.ts`, `mobile/src/sync/parkedReason.ts`;
`PROJECT_STATUS.md`, `ROADMAP.md`, `OPEN_ITEMS.md`.

**WHAT STAYS OPEN.** The CONTINUOUS reserve strip (commit 2 — capture
`refillOnce`'s answer that `topUpReservations` discards, persist `target`, draw
the strip); the handset device pass; the scratch-DB server pass. All three are
recorded in `ROADMAP.md § P1.8`'s partition and `OPEN_ITEMS.md`.

**IS A LESSON OWED? NO, BY `CLAUDE.md § Workflow` "Two homes, one test".** The
`refillOnce` false claim this phase corrected is a report asserting a wiring state
nobody verified against the tree — which is already
`CLAUDE.md § Workflow` "A REPORT IS A CLUE, NOT A SOURCE", extended in that rule to
a claim a session wrote itself and to status files. It is not a property of this
box (no lesson home) and
not opened by a task-specific index line (it applies to every present-tense
claim), so a lesson would be the ceremony that dilutes the index. Corrected where
it lives: a dated supersession in this file's c4 entry.

---

**P1.23 c4 — THE FOUR RESERVE-LEVEL SENTENCES, THEIR TONE, AND THE COMPILE CELL.
DONE 2026-08-28.** This supersedes the P1.23 c3 entry below as the current phase;
that entry's record stands unchanged. **NO SHA IS GIVEN**, deliberately — the work
carrying this sentence is uncommitted at the moment it is written, so the only sha
available is the one that does NOT contain it
(`CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT"). It closes
`THE-RESERVE-LEVEL-IS-REQUIRED-AND-EVERY-VALUE-HAS-ITS-OWN-SENTENCE`, a headless
criterion; the legibility layer that must exist before offline creation spends a
reserved code.

**WHAT IT BUILT, stated as values and a rule, each paired with the cell that
reddens** (`lessons/printed-code-in-a-design-document-is-run-by-nobody.md`: no
sentence sequences here).

- **Four values, four sentences, one each.** `mobile/src/master/reserveNotice.ts`
  maps `reserveLevel`'s four values — `ample`, `low`, `exhausted`,
  `never_provisioned` — each to its own Thai sentence, derived from the CAUSE of
  that state. `low` NAMES how many codes remain, a REAL count off the holding,
  never defaulted (`fallback-default-is-a-wrong-number`). RED CELL: R2 asserts all
  four are distinct and drives `reserveSurface` over each value's precondition
  holding; the disproof collapsing `never_provisioned` into `exhausted` reddened
  R2's distinct cell and R3's direction cell, 2 of them.
- **`never_provisioned` is NOT `exhausted`.** A device that has spent nothing must
  not be told it used up its codes. RED CELL: R3 asserts by DIRECTION both ways —
  each names its own state (`ยังไม่เคยรับ` / `หมด`) and not the other's.
- **Tone by one question — does this state need a person NOW — and there is no
  amber.** `ample` no, `low` no (the next online pass tops it up), `exhausted`
  yes, `never_provisioned` yes: the four tones are none, none, red, red. An amber
  on `low`, the normal state of a working device, is a red its reader is trained
  to ignore. RED CELL: R4 asserts the tone over ALL FOUR values; the disproof
  giving `low` a red tone reddened exactly `tone(low) === none`.
- **`exhausted` promises no wait and names what is still possible.** No passive
  refill promise; it names a bill against an existing seller as still possible;
  it does NOT offer picking a different seller for this load. RED CELL: R4's
  negatives, each with a control — the ban on the passive-refill phrase is not
  vacuous because `low` legitimately carries it, and the presence sibling names
  the still-possible action; the disproof adding a passive-refill promise to
  `exhausted` reddened exactly that one negative.
- **The level is a REQUIRED, closed union.** A value it cannot express fails to
  compile. RED CELL is the COMPILE CELL, run by hand.

**THE OBSERVATIONS, every command bare with its status read in the same
invocation. No server, no device.**

- Both TypeScript programs exit 0, each bare, before and after.
- `npm run prove:reservenotice` (new) exit 0 TWICE, own fixture (pure — no store,
  no reseed), preset red at entry. 20 cells.
- **The three disproofs, cell named before each run:** (A) `never_provisioned`
  collapsed into `exhausted` → exactly R2-distinct and R3-direction (2); (B) `low`
  given a red tone → exactly `tone(low)` (1); (C) a passive-refill promise added
  to `exhausted` → exactly the no-passive-refill negative (1), the control on
  `low` staying green.
- **The COMPILE CELL, run by hand** (the outcome-union shape). `reserveLevelNotice("amber", 5)`
  — a tone mistaken for a level, a value the closed union cannot express — made
  BOTH programs exit 2 with `src/master/reserveNotice.ts(121,27): error TS2345:
  Argument of type '"amber"' is not assignable to parameter of type 'ReserveLevel'`,
  the file and symbol named. THE VANISHING-ERROR DISCRIMINATOR: the SAME `"amber"`
  under the wider type `string` compiles — both programs exit 0 — so the closed
  union is what excludes it.
- **Every pre-existing headless proof green TWICE, real `process.exitCode`, counts
  identical between runs and unchanged from the c3 baseline** — 32 of them,
  including `provePickerSeller` 15, `proveParkedBill` 58, `proveSellerKind` 69,
  `proveOutbox` 77, `proveSync` 247 — because c4 changed no existing module. The
  new `proveReserveNotice` is 20.

**FILE SET, six paths.** New: `mobile/src/master/reserveNotice.ts`,
`mobile/src/proof/proveReserveNotice.ts`. Edited: `mobile/package.json`,
`ROADMAP.md`, `PROJECT_STATUS.md`, `OPEN_ITEMS.md`.

**WHAT STAYS OPEN, said so it is not read as settled.** The criterion is HEADLESS
and closes, but the level is shown on NO screen yet: `reserveSurface` needs the
device's `target`, which arrives only in a refill answer `refillOnce` discards
today, and `refillOnce`'s call site is the next unit's — so the continuous strip
that the B1 legibility finding calls for is owed with the offline-creation wiring.
Recorded in `OPEN_ITEMS.md § Code debt` and in `ROADMAP.md § P1.8`'s partition.

**SUPERSEDED 2026-08-28 (offline-creation wiring, `94a0d47`): "`refillOnce`'s
call site is the next unit's" IS FALSE, AND WAS FALSE WHEN THIS c4 ENTRY WAS
WRITTEN.** Re-derived against the tree, not from a report: `SyncEngine.runOnce`
(`mobile/src/sync/engine.ts:358`) calls `topUpReservations` (`:403`), which calls
`refillOnce` (`:405`); `refillOnce` is imported at `engine.ts:20` and defined at
`sellerRefill.ts:193`. So `refillOnce` has had a LIVE caller at the end of every
pass since **`48c422a`** ("feat(P1.8b gates, commit 2): … a function proven eight
days ago finally gets a caller", 2026-08-25) — three days BEFORE this c4 entry was
written. The P1.8b GATES record further down this file already states it correctly
("`refillOnce` has a call site at the end of every pass"); the c4 sentence
restated an unverified report over a fact the tree AND this same file already
carried — `CLAUDE.md § Workflow` "A REPORT IS A CLUE, NOT A SOURCE".

**WHAT IS ACTUALLY TRUE.** `refillOnce` is LIVE and is KEPT — it is the
prerequisite this phase spends, minting the reserved codes an offline create
consumes, against real code space on every online pass since `48c422a`. What
reaches no screen is `refillOnce`'s ANSWER, not `refillOnce`: it RETURNS a
`RefillResult` carrying `holding.target`, and its caller `topUpReservations`
DISCARDS the return value (`engine.ts:405`, the result is not captured). So "a
refill answer `refillOnce` discards" should read "a refill answer
`topUpReservations` discards"; the substantive claim — the target reaches no
`HoldingCounts`, so `reserveSurface` cannot render a continuous strip — stands,
and that strip is this phase's commit 2, not a missing caller.

**IS A LESSON OWED? NO, BY `CLAUDE.md § Workflow` "Two homes, one test".** Nothing
here is a property of this box — no codepage, shell or line-ending trap. Every
discipline leaned on is an existing lesson RE-APPLIED:
`correct-classification-can-still-render-as-an-error` (derive the sentence from
the cause, assert negatively over the concatenation),
`fallback-default-is-a-wrong-number` (`low`'s count is real, never defaulted),
`a-narrowing-type-is-not-a-barrier-to-the-object` (the signature bars a diagnostic
because neither parameter's type admits one — stated precisely), and
`printed-code-in-a-design-document-is-run-by-nobody` (this record states values
and a rule, no statement sequence). One operational slip, caught: a proof was run
from a STALE `dist/` after a source edit and gave the previous disproof's result
until re-run through `npm run prove:*` — the exact hazard `START_HERE.md § 4`
already warns of, not a new lesson.

---

## What is built

### `server/` — running API

- **Schema**, migrations `0001`–`0005` in `server/migrations/versions/`:
  `tenants`, `users` (role `admin`|`staff`), `uoms`,
  `product_categories`, `products`, `product_prices` (grade A–D),
  `sellers` (grade, id_number, address, vehicle_no — per SRS 1.6),
  `purchase_bills`, `purchase_bill_items`. The four master-data tables
  carry `is_active` (0004). `users.token_version` (0005) is minted into
  every token and re-read from the user row on every request — on the same
  query `get_principal` already runs to resolve the role, so it costs no
  extra round trip. **DEFAULT 1, never 0**, so a token carrying no version
  claim matches no user row: an absent claim is refused rather than read as
  a confident zero. Row-level security is FORCEd per tenant; the
  runtime role `recycle_app` is NOSUPERUSER + NOBYPASSRLS and holds
  DML only.
- **Endpoints** (`server/app/`), in THREE categories, not two. **No
  authentication at all**: `GET /health` (`main.py:105`), `POST /auth/login`
  (`main.py:119`) — read off the handlers, neither of which takes a
  principal. **Both positions were stale and were re-derived at `8b17bc2` on
  2026-08-10**; this read `:53` and `:58`, which are `await engine.dispose()`
  and a blank line. The classification above was and is correct — only the
  two numbers had rotted, which is the failure mode a position-carrying
  citation has and a symbol-carrying one does not.
  This file used to file both under "open to any signed-in
  user", which was wrong in the direction that matters: it described an
  unauthenticated surface as an authenticated one. **Any signed-in user**
  (`Depends(get_principal)`): `GET /whoami`, `GET /products`,
  `GET /sellers`, `GET /uoms`, `GET /product-categories`, `POST /bills`,
  `GET /bills`, `GET /bills/{id}`. **Admin only** (`Depends(require_admin)`):
  `POST /bills/{id}/void`,
  `POST`+`PATCH` on `/uoms`, `/product-categories`, `/products`,
  `/sellers`, `PUT /products/{id}/prices/{grade}`, and
  `POST /{entity}/{id}/deactivate`+`/activate` on all four,
  `GET /reports/daily`, and `POST /users/{user_id}/revoke-sessions`
  (`users.py:56`) — which its own docstring labels a STOPGAP: it ends live
  SESSIONS and does NOT lock the account, because `users` has no
  `is_active` column, so the user can sign in again the same second and
  receive a fresh token carrying the new version. Every request
  is scoped to its token's tenant with `SET LOCAL` inside the request
  transaction. `code` is immutable after create on every entity — it is
  what a historical bill is read against.
- **Reconciliation** — `reconcile.py`, the one instrument that checks the
  money against itself rather than exercising a path. Not a proof: it makes
  no fixtures, writes nothing, and is meant to be run against a REAL
  database, including a restored copy (`--database`). 17 checks per tenant
  (totals, line arithmetic, weights, the doc_no series and its counter,
  reference resolution, the void columns, idempotency keys, line numbering)
  plus 10 global (schema shape, RLS enabled/forced/policy, role attributes,
  named constraints, two blind reads, cross-tenant references, sweep
  completeness, and whether the database moved while it ran). Exit 0 / 1 /
  2 = clean / violations / could-not-run. Runbook is its own `--help` and
  module docstring.
- **Proofs** — THIRTEEN scripts in `server/scripts/`, each exercising a
  real path against a live database: `prove_rls`, `prove_auth`,
  `prove_master`, `prove_bills`, `prove_master_data_gate`,
  `prove_shop_time`, `prove_seller_pricing`, `prove_backup_restore`,
  `prove_master_write`, `prove_daily_report`, `prove_reconcile`,
  `prove_docno_clock`, `prove_revocation`. **Two now require a SCRATCH DATABASE and refuse the live
  one**: `prove_reconcile` (it breaks invariants on purpose) and
  `prove_docno_clock` (it lies to the server about the time, which against
  unfixed code permanently corrupts a doc_no series). Both take `--database`.
  `prove_reconcile` is the odd one out: it can restore a COPY (calling
  `restore_db.py` itself, so that run starts from a known dump), breaks
  each invariant on purpose, and asserts the checker fires, NAMES the row,
  and clears again when the injection is undone. Each must pass twice in a row without
  reseeding (`lessons/proof-must-run-twice.md`). `seed_dev.py` loads
  the dev fixture — now an `admin` AND a `staff` user per tenant, since
  a role gate cannot be proven without a token that gets refused.
  **CORRECTED 2026-08-09 — the `prove_reconcile` sentence above read "so every
  run starts from the same dump" and that was FALSE.** Established from the
  source and not from a run: `restore_copy()` has exactly ONE call site and it
  sits inside `if args.backup:`, so the restore happens only on a run given
  `--from`. `--skip-restore` is the documented alternative, and the argument
  check refuses only when NEITHER flag is passed. A `--skip-restore` run never
  calls `restore_db.py`, SKIPs the diagnosis claim rather than passing it
  (`normalise(..., restored=False)`), and can still return 0 through the
  `PROVE_RECONCILE OK, WITH SKIPS` branch — so a full two-consecutive-run pass
  is completable with the copy never restored from a dump at all. The owner
  had observed such a run; the prose was the thing that was wrong. This
  matters beyond tidiness: the 0009 blast-radius claim in `OPEN_ITEMS.md`
  names this script, and that red can only reach a `--from` run.
- **Backup** — `backup_db.py` writes plain `globals.sql` /
  `database.sql` / `recycle.sql` + manifests + sha256 to a host path
  outside the docker volume; `restore_db.py` restores into a scratch
  database by default and refuses to touch an existing live one
  without `--overwrite-live`. Runbook: `server/scripts/BACKUP.md`.
  `prove_backup_restore.py` mutates the source AFTER the dump, so a
  restore that did nothing cannot pass.
- **Local runtime**: Postgres 16 via `server/docker-compose.yml`,
  container `recycle_pg`, host port `5544`. `JWT_SECRET` has no
  default and the API will not start without one.

### `mobile/` — Expo app, offline-first

One npm package on purpose; nesting a second one breaks Metro's file
map (`lessons/metro-file-map-nesting.md`). Two disjoint TypeScript
programs — see the boot check in CLAUDE.md.

- **Sync engine** (`src/sync/`): local-first writes, per-record
  pending / synced / failed, a strict head-of-line send queue, and
  three-way failure classification — unavailable (retry forever),
  permanent (terminal), resolvable (parked, still owed). Queue-health
  alarm distinguishes an offline backlog from a poisoned head;
  startup recovery sweeps records stranded mid-flight; an expired
  session is its own state, not a bill failure; stored future
  instants are treated as clock evidence, not data.
- **Storage** (`src/adapters/sqlite/`): bills store, crash-safe draft
  store, master-data cache store, shared driver and mutex, schema.
  Money and weight are TEXT — the guarantee is the TypeScript type,
  not the column (`lessons/sqlite-money-is-text.md`).
- **Device-only code** (`src/device/`): the expo-sqlite driver and
  the SecureStore token store. Neither can run under node — see the
  device gaps below.
- **Money and time**: `decimal.js` with precision set for the domain
  scale; one shop-time formatter (fixed UTC+7) with the พ.ศ. year
  derived after the timezone conversion; clock-sanity checks on
  stored stamps.
- **Screens** (`App.tsx`, `app/`): ~~login,~~ cart entry with numpad,
  per-bill seller picker, master-data strip with freshness state,
  status strip and operator notices, bills panel with the void flow,
  and the sign-out sheet (`app/SignOutSheet.tsx`), which can REFUSE —
  it will not end a session while bills are still queued unsent.

  **~~login~~ — NOT A SCREEN. Struck 2026-08-11, measured at
  `5e59894`.** With no token `App.tsx` renders one button, labelled
  `เข้าสู่ระบบ (ร้าน A)`, calling `signIn()` with constants imported from
  `app/config.ts`. It asks for nothing — `TextInput` appears in
  `App.tsx` **0 times**. This file already said so, dated:
  `§ 2026-08-07 — migration 0006 (server + proof)` "has no `TextInput`".
  The struck word entered at `534f289` (2026-07-27), the commit that
  created this file; whether it was true then is not measured here.

  **REINSTATED 2026-08-12 — LOGIN IS A SCREEN AGAIN. The strike above is left
  exactly as taken, because it was true at `5e59894`.**
  `mobile/app/LoginScreen.tsx` landed at `4bde6e1` with username and password
  fields; the shop is an eight-character code typed once at setup and resolved
  BY THE SERVER, and `app/config.ts` now holds only the server URL.
  **OBSERVED ON A HANDSET:** after a real sign-out and a cold start it drew the
  username and password state, and nobody was asked for a shop code. **The
  artefact is a TEST artefact** — this project's own Android DEBUG build
  (`9d2eb22`, `dev.chutipon.recycle`), one vivo 1938, never Expo Go, its API
  address a plain-HTTP LAN address baked in at build time. **NOT OBSERVED:**
  nobody signed in through it to reach the cart screen and nothing was weighed,
  the product and seller lists being empty on that tenant; iOS has never drawn
  it; and no release build exists on either platform.
- **The owner's screen** (`app/DailyScreen.tsx`, `src/reports/dailyView.ts`):
  the day's total, the permanent understatement caveat, voided bills, voids
  applied today against older bills, off-list payments, and the bill list. Read
  only; needs the server; renders calmly when it cannot have one.
- **Proofs**: FOURTEEN headless `npm run prove:*` scripts —
  `sync`, `sqlite`, `money`, `cart`, `entry`, `seller`, `notice`,
  `void`, `time`, `cold`, `clock`, `daily`, `forbidden`, `signout`.
  `prove:signout` (`src/proof/proveSignOut.ts`) covers the refusal path,
  the cleared-session list and the draft that must SURVIVE a sign-out.
  `prove:forbidden` is the
  first mobile proof that REQUIRES the live API: its F6 logs in as the
  seeded staff user and reads the server's actual 403 through the real
  `HttpTransport`. `--offline` skips that case and exits **2**, never 0.

### `desktop/` — not started

Empty but for `.gitkeep`. No Electron scaffold, no printing code.

## What is NOT built

**Out of MVP — do not build, do not scaffold** (moved verbatim from
CLAUDE.md, where it used to live as "MVP scope"):

sell flow, stock, other income/expense, checkbox permissions,
employee master, buyers, profile images, QR codes, scale
integration, Excel export, reports.

**In the product, not yet started**: the entire `desktop/` back
office — master-data editing, bill viewing, ESC/POS thermal slips
(58/80mm). When the slip is built it must PORT `mobile/src/time/
shopTime.ts` (offset constant, brand, ordering rule), not re-derive
`+ 543` in Electron; a second implementation drifts exactly at the
boundary neither author tested.

**Blocking one real shop** (from audit 2). This is NOT a scope list —
it is the gap between "built" and "usable by one paying yard". Every
item below is missing infrastructure around work that already exists,
not a new feature:

- **A reachable server.** The API runs on this box and the app points
  at a LAN address (`mobile/app.json` `extra.apiBaseUrl`). A shop
  needs a host it can reach from anywhere. (The backup half of this
  item is done — see Backup above — but a local-only backup does not
  survive fire, theft or ransomware, and NOTHING SCHEDULES IT. Until
  someone runs it, the honest statement is still "one copy".)
- **An installable build.** Staff need the app on their own phone,
  not Expo served from a development machine.
- **Real per-shop login.** Accounts and credentials the shop owns,
  created for it — not the dev fixture from `seed_dev.py`.
- **SIGN-OUT — CLOSED by R1, 2026-08-06** (`19a6b63` server half, `7484645`
  client half). This item read **"NO SIGN-OUT. A shop cannot change who the
  phone is logged in as."** — **a SECURITY item, not a convenience one.**
  Written here as "A3" before the numbering was settled; A3 was never opened
  and the work became **R1 in `ROADMAP.md`** — the first step, because it was
  blocked by nothing and two other steps waited on it.

  **What now exists.** A phone can end its session deliberately
  (`app/SignOutSheet.tsx`, `src/session/signOut.ts`), and the server can refuse
  a token it already issued: `users.token_version` (migration 0005) is minted
  into every token and re-read from the user row on every request, so bumping
  it through `POST /users/{user_id}/revoke-sessions` stops every token issued
  before the bump at that token's next request. Both halves have been observed
  on a real handset — see Current phase and the 2026-08-06 device pass in
  Baseline observations.

  **The diagnosis that made it first, kept as the record.** Read out of the
  files rather than assumed, at the time: `TokenStore.clear()` EXISTED and
  `SecureTokenStore` implemented it (`SecureStore.deleteItemAsync`), and
  **nothing called it** — `App.tsx` called `load()` at boot and `save()` on
  sign-in and that was all; there was no sign-out button, no menu, no path of
  any kind. `expo-secure-store` puts the token in the iOS **Keychain**, which
  survives deleting Expo Go, so reinstalling the app did not clear it either.
  **That last fact is unchanged by R1** and is still why a handset holds what
  it holds; what changed is that something now calls `clear()`, and that the
  server no longer has to take the token's word for it.

  The exposure was bounded, and the bound is kept here because it is what made
  this a defect rather than a catastrophe: `JWT_TTL_SECONDS` defaults to 3600
  and there is no refresh token, so an issued token stopped being accepted
  within the hour anyway. What was missing was any way to end a session
  **deliberately, at the moment someone leaves** — and any way to end it from
  the server side at all. **Both of those now exist.**

  **What R1 did NOT fix**, written so that "closed" is not read as more than it
  is: `users` still has no `is_active` column, so a revocation ends live
  SESSIONS without locking the ACCOUNT — the user can sign in again the same
  second and receive a fresh token carrying the new version. That is right for
  a handover and wrong for a dismissal, and there is currently no way to
  express the second. The revocation endpoint says so in its own docstring and
  calls itself a stopgap.

  **CORRECTED 2026-08-05.** This paragraph used to end by saying that bills
  written on a handed-over phone are "attributed in `purchase_bills` to the person
  who left", and that this was the audit trail naming the wrong person. **That was
  false, and it had never been read out of the schema.** `purchase_bills` has NO
  AUTHOR COLUMN: `grep -rn "created_by" server/` returns nothing, and the INSERT at
  `server/app/bills.py:450-453` writes id, tenant_id, seller_id, doc_no,
  idempotency_key, total_amount, device_created_at, server_received_at and
  vehicle_no — no user of any kind. The only user recorded on a bill is
  `voided_by`, written from the requesting token when a bill is VOIDED
  (`bills.py:602`). So the audit trail does not name the wrong person; **there is
  no name on it to read at all.** A bill cannot be traced to the staff member who
  weighed the load and handed over the cash, and that is **not repairable
  backwards** — every bill already written stays authorless forever, whatever is
  added later. It is tracked as its own item in `OPEN_ITEMS.md`, as a SCHEMA and
  audit question; it is **not** part of R1 and adding the column would not make one
  existing bill traceable.

  **THIS PREDICTION WAS RIGHT, AND R1 DID BOTH HALVES** — `19a6b63` (server:
  `token_version`, migration 0005, `prove_revocation.py`) and `7484645`
  (client: the sheet, the cleared-session list, `proveSignOut.ts`). The
  text below is kept UNEDITED because a correct prediction is evidence
  that the ordering decision was sound, and because deleting it would leave
  the decision looking arbitrary in hindsight. It argued that a client-only
  sign-out would be a false fix and that the server half was the hard half;
  both held.

  **The client half is nearly free and the server half is not**, which is exactly
  why it must not be done by halves: a sign-out button is one existing method
  wired to one button, and it would make the problem look dealt with while an
  already-minted token stayed valid for up to an hour with nothing able to refuse
  it. The server side needs a way to reject an issued token before its expiry —
  e.g. a token version on `users`, bumped on password change or deactivation and
  checked in `get_principal`, which already re-reads the role on every request.

  Found by the A1 device pass, where it presented as a testing obstacle: the app
  would not take a staff session no matter what `app/config.ts` said, because
  those credentials are only read by `signIn()` and a device holding a restored
  token never calls it. That is the same mechanism wearing a friendlier face, and
  it is why A1's 403 rendering is still unverified on device.

  Deliberately NOT fixed in A1, which was UI-only on an existing endpoint.

  **One sentence in the text above has since expired, and is marked rather than
  edited:** "it is why A1's 403 rendering is still unverified on device" was
  true when written and stopped being true on **2026-08-06**, when R1 made a
  staff session possible on that handset and the 403 rendering was drawn under
  it. That is R2 item 1; see Baseline observations. The mechanism the sentence
  describes is still correctly described — it is the CONSEQUENCE that lifted.
- **A back office to drive any of it.** The whole master-data write path
  now exists and is proven over HTTP, but the only thing that can call it
  is `curl`. `desktop/` is still empty, and the yard app is deliberately
  read-only for master data — so a shop still cannot set up its own
  products, prices or sellers without someone running requests by hand.
- **A daily money view — the server half AND a mobile screen now exist**
  (`GET /reports/daily`; `app/DailyScreen.tsx`). An owner can open it on a
  phone. **No longer device-unverified: R2 closed it on 2026-08-06**, admin
  rendering having been observed on 2026-08-02 and the two remaining paths —
  the 403 refusal and a hung socket — on 2026-08-06. The two are not equally
  strong evidence and Known device gaps says which is which. What remains is
  that the desktop back office still has no version of it — a shop owner who
  works from a PC still cannot see the day's takings there.

## Known device gaps

Everything here is unverified, not broken. It is listed so no one
reports it as proven.

- **Android: ONE pass, 2026-07-29, on a borrowed handset.** No longer
  "never run", and nowhere near covered. What was actually exercised:
  the bundle built and opened; Thai rendered correctly with NO bundled
  font; the real `expo-sqlite` driver created the schema fresh on a
  device that had never held the database; a bill was weighed, saved
  and synced; the numpad kept the OS keyboard off the numeric path;
  the void-REASON input's keyboard behaved; safe-area insets were
  correct. Plus, from the multi-device run below: one bill saved
  offline and synced on reconnect.

  What was NOT run on Android, and must not be reported as working:
  the rest of the offline behaviour (queue-health amber/red, backoff,
  parked bills, expired session, the poison alarm), force-quit draft
  recovery, the stale-cache price gate, the VOID FLOW end to end —
  including the 403 refusal path this phase built, which has only ever
  been seen on iOS — and sync while backgrounded. One handset, one
  OS version, one screen size.

  **A SECOND ANDROID PASS, 2026-08-12 — and it closes none of the list
  above.** The bullet's opening count is now two, not one; the rest of it
  stands. **The artefact was a TEST artefact:** this project's own Android
  DEBUG build (`9d2eb22`, applicationId `dev.chutipon.recycle`), a second
  handset, a vivo 1938, never Expo Go, its API address a plain-HTTP LAN
  address baked in at build time, so it reaches a server only on this
  network. **WHAT IT OBSERVED:** the login screen drawn after a real
  sign-out and a cold start; a session established and cleared, read at
  `shared_prefs/SecureStore.xml` (count 1 signed in, count 0 after) and at
  a new process; and the migration force-stopped twice mid-transaction
  with the complete old shape surviving both times, controls both ways.
  **WHAT IT DID NOT:** nobody signed in through that screen to reach the
  cart screen and nothing was weighed — the product and seller lists were
  empty on that tenant — so the void flow, the offline behaviours, draft
  recovery, the stale-cache price gate and background sync are untouched
  and remain exactly as listed above. **iOS ran the secure store's clear
  in the 2026-08-06 pass and has never run the migration**, and **no
  release build exists on either platform.**
- **Two devices RACING is still unproven on real hardware.** Two phones
  writing to one tenant is now observed (below), but they reconnected
  158 ms apart. That is "near-simultaneous", not "inside the same
  millisecond", and only the second is a race. The concurrent
  same-key/same-counter path remains proven only headless, with a start
  barrier and printed overlap (Phase 1c; see
  `lessons/concurrency-tests-need-a-barrier.md` — without a barrier the
  workers ran sequentially and a green result proved nothing).
- **`src/device/expoSqliteDriver.ts` has no headless proof.** It
  cannot run under node (ESM with extensionless specifiers that only
  Metro resolves, plus `requireNativeModule('ExpoSQLite')`), so it is
  exercised only by manual device passes. Its transaction path
  genuinely differs from the node driver: expo-sqlite's
  `withExclusiveTransactionAsync` hands the callback its OWN
  connection, so isolation comes from SQLite's file write-lock plus
  `busy_timeout`, not the JS mutex. That `changes` is reported
  honestly is an assumption the store methods rest on.
  **The Android pass does not touch this**, and the distinction is the
  whole point: a bill weighing, saving and SYNCING exercises single
  statements, which is every method in `SqliteLocalStore`. The multi-
  statement path is `promoteToBill` (insert the bill and clear the
  draft, indivisibly), and what is unverified there is its CRASH
  WINDOW — kill the process mid-transaction and see that exactly one of
  {draft, bill} survives. That is proven under `node:sqlite` only
  (`proveCart` C5, both sides of the commit, with a real SIGKILL). A
  successful save says nothing about it.
  **NARROWED 2026-08-12, and read the narrowing precisely — it is smaller
  than it looks.** The driver's `transaction()` MECHANISM has now been
  killed mid-flight on real hardware and held: Android only, on this
  project's own DEBUG build (`9d2eb22`, `dev.chutipon.recycle`), one
  vivo 1938, never Expo Go; two force-stops inside a migration window
  widened to tens of seconds by a 150,000-row seed, complete old shape
  both times, rows intact, controls both ways. **What that covers is
  `initConnection`. It does NOT cover `promoteToBill`**, which is a
  different call site with a different failure question — exactly one of
  {draft, bill} — and which no device pass has ever killed. The bullet
  above stands unchanged for that path. **iOS has never run either, and
  no release build exists.** `changes` being reported honestly was not
  isolated by that pass either.
- **`src/device/secureTokenStore.ts`**: that SecureStore honours the
  contract is unverified off-device. **NARROWED, not closed, 2026-08-06.**
  The R1b pass exercised `clear()` on a real handset and the Keychain really
  did clear — after signing out the screen read `ยังไม่ได้เข้าสู่ระบบ`, which
  is different wording from `หมดเวลาเข้าใช้งาน`, so the two states are
  distinguishable ON THE DEVICE and not only in the proof. What that settles
  is `save`/`load`/`clear` on the happy path of one iOS version. It says
  nothing about the store's behaviour when the Keychain itself refuses — a
  locked device, a restore from backup, or a `deleteItemAsync` that throws —
  and those remain unverified off-device.
  **NARROWED AGAIN 2026-08-12 — ANDROID, and with evidence of a kind the iOS
  pass did not have.** On this project's own DEBUG build (`9d2eb22`,
  applicationId `dev.chutipon.recycle`), one vivo 1938, **never through Expo
  Go** — Expo Go is a third party's release-signed package and refuses
  `run-as`, so it could not have produced any of this. Two readings the 2026-08-06
  pass never took. AT THE STORE: `shared_prefs/SecureStore.xml` held the entry
  `key_v1-recycle.session.token` with count **1** while signed in, and count
  **0** after the sign-out — the file still present, 840 bytes down to 65, zero
  entries, which is a different and stronger outcome than the file being gone.
  AT A NEW PROCESS: force-stop, cold start, and `App.tsx:606`'s `load()`
  returned null and drew the login screen — the exact observable
  `src/session/tokenStore.ts` names as the failure it is guarding against.
  Method controlled in the same run: a key known to be absent counted 0, and a
  string known to be present counted 1, on the same file.
  **STILL UNVERIFIED, and this is the whole of what is left**: the REFUSING
  keystore, on either platform — no real store has ever been made to fail, so
  the `failed` branch is still a contract; `AFTER_FIRST_UNLOCK` on a device not
  unlocked since power-on; and **NO RELEASE BUILD EXISTS on either platform**,
  so `run-as` would not work on a shop's artefact and this reading method does
  not transfer to it.
- **The daily money screen: TWO passes — 2026-08-02 (real iPhone, ADMIN) and
  2026-08-06 (real iPhone, STAFF; R2).** Rendering, day stepping and the
  offline path were observed on the first (see Previous phase). What that pass
  settled, worth naming because each was listed as a risk before
  it: `new Date()` on a SIX-DIGIT fractional-second ISO string with a `+07:00`
  offset parses under Hermes (times rendered, not `—`), and the 44pt
  `adjustsFontSizeToFit` amount is readable at a real width.

  **R2 item 1 — the 403 rendering. CLOSED on strong evidence.** Drawn on a
  device for the first time, under a staff account: `GET /reports/daily` from
  the handset was answered 403, and the screen showed a red card with **no
  money field anywhere on it** — not a zero, not a dash. **The tie between the
  log line and the screenshot is by SOURCE ADDRESS AND UNIQUENESS, not by
  clock** — it is the only 403 in the log and it came from the phone's address
  rather than from curl on the box; the uvicorn lines carry no timestamps.
  Full record in Baseline observations.

  **R2 item 2 — a hung socket. CLOSED on the roadmap's wording ("has been
  staged"), and WEAKER than the item's name suggests.** Read this one
  carefully. **What IS established:** a socket that completes the TCP accept
  and then never answers ends in the no-number outage screen rather than a
  `0.00` day. **What is NOT established:** that it ended at the 20 s ceiling
  specifically, rather than at some other transport failure. The duration was
  WATCHED on an operator's stopwatch, not measured, and this is the same
  screen a REFUSED connection would produce. The staged socket is not uvicorn,
  so the log contains no line for it; that absence is expected and is evidence
  of nothing. Treat the ceiling itself as unverified.

  What the two passes did NOT touch, and must not be reported as working:
  - **a truncated day** — `bills_truncated`, the capped void list, and the
    off-list "count outruns the page" note are proven headless only. Reaching them
    needs a day of >200 bills.
  - **a past day with real trade in it**, and **the 422 `day_in_the_future` path**,
    which day stepping is deliberately bounded to avoid.
  - **Android.** The whole screen is iOS-only so far.
- **Hermes `Intl` with a `timeZone` option is unverified.** This is
  why shop time is a fixed UTC+7 offset on both sides rather than a
  named zone: a silently-ignored `timeZone` would print UTC again.
  A per-tenant zone that observes daylight saving cannot be a fixed
  offset and must be verified on a device before it ships.
- **Hermes `crypto.randomUUID` and property escapes** are unverified
  (noted in `src/sync/types.ts` and `src/cart/sellers.ts`).
- **Python `zoneinfo` cannot resolve `Asia/Bangkok` on this box** —
  Windows ships no IANA database and `tzdata` is not installed, so
  `app/config.py` uses a named fixed offset. Installing `tzdata` is
  a prerequisite for any future per-tenant timezone work.

## Known scaling limits

Measured or reasoned, not yet hit. Recorded so they are not rediscovered as
mysteries — and so nobody "optimises" them before they matter.

- **No index for the daily report's day predicate.** `GET /reports/daily`
  filters `purchase_bills` on `(tenant_id, server_received_at)`. Migration
  0001 gives that table only `(tenant_id, id)` and a partial
  `(tenant_id, doc_no)`, so **every daily report is a sequential scan** over
  the tenant's whole bill history, and it gets one row slower per bill
  bought — forever. At one shop's current volume (301 bills in the dev
  tenant) this is not measurable and **must not be fixed yet**: an index is
  a write cost on the hot path (`POST /bills`) paid to speed up a report
  nobody has opened, and the endpoint has no UI. It becomes real at roughly
  a year of trade, or the first time a shop reports the day view feeling
  slow. **The fix, when wanted, is one migration:**
  `CREATE INDEX ix_bills_tenant_received ON purchase_bills (tenant_id, server_received_at)`.
  Deliberately NOT added this phase. Nothing else in `reports.py` needs a
  schema change.
- **`reconcile.py` holds one tenant's numbered bills in memory at a time.**
  T7/T8/T9 need every `doc_no` for the tenant, because the BE year must come
  from `bills._be_year` per row rather than from a second `+543` written in SQL
  (that is the point, not an oversight — see the lesson). Bounded by ONE shop's
  history, not by the whole database, and 305 bills cost 0.9s for the entire
  46-tenant sweep. At the size where this stops being sensible the fix is
  recorded in the function's own docstring: make them per-`be_year` aggregates
  and apply `_be_year` to the year boundaries instead of to each row. Note the
  sweep also holds one REPEATABLE READ snapshot open for its duration — a
  vacuum consideration on a large database, never a correctness one.
- **The void lists are capped, not paged** (500, with a `truncated` flag).
  A day that reaches the cap is itself the finding; paging the
  fraud-surveillance list is the wrong thing to page.

## Tuned constants — trial ledger

**THE RULE. Once a real shop is using this, any change to a value in this table
is a TRIAL and gets a row — old value, new value, date, and what was observed
that prompted it. The COUNT matters, not just the final value.** A threshold
nudged until the complaints stop is a threshold fitted to noise: each nudge looks
like a fix because the thing being measured is somebody's patience, and after
four rounds nobody can say whether the number is right or merely quiet. A value
on its first trial is a guess and should be read as one; a value on its fifth
without a written reason each time is worse than the guess, because it has
acquired authority it never earned.

Every row below is at **trial 1 — chosen once, by judgement, never re-tuned.**
Verified with `git log -S` per constant rather than asserted: each appears in
exactly one commit (`}, 4000)` shows two, and the second is a refactor that moved
the line without changing the number).

These are the values chosen by JUDGEMENT. Values DERIVED from something else are
excluded and listed at the foot, so the next sweep does not re-add them.

### Sync engine and queue health

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `backoffBaseMs` | **2 s** (engine default 1 s) | `App.tsx:428` | **unrecorded — chosen without a written reason.** Reconstructible: it is an OVERRIDE of the engine default, so deviating was deliberate even though the target was not written down | 1 |
| `backoffMaxMs` | **30 s** (engine default 5 min) | `App.tsx:429` | **unrecorded — chosen without a written reason.** Reconstructible, and it is load-bearing twice over: `clockSanity.ts:74` cites it by name, and `MAX_ATTEMPT_CYCLE_MS` is derived from it. At 30 s a stuck head retries ≥3× inside `POISON_ALARM_MS` (90 s), so the clock trigger can fire before the count trigger — raising it past 90 s would silently make the count the only live trigger | 1 |
| `masterDataRetryMs` | **5 min** (default, not overridden) | `engine.ts:150` | "deliberately SLOW and deliberately not a backoff: retrying sooner cannot make the office add a price faster, and the operator has an explicit retry for the moment they have added it" | 1 |
| `batchLimit` | **100** | `engine.ts:149` | "bills examined per pass. Bounds the work of one run; not a retry cap" | 1 |
| `POISON_ALARM_MS` | **90 s** | `queueHealth.ts:51` | explicitly labelled a GUESS. "Long enough to ride out a brief server hiccup or deploy blip; short enough that a genuinely poisoned bill surfaces before a real backlog piles up." The offline/amber state deliberately has NO timer | 1 |
| `POISON_ALARM_ATTEMPTS` | **5** | `queueHealth.ts:77` | a second trigger for the same alarm, because a clock alone assumes a poisoned bill takes time to become obvious — only true while the backoff is short. Carries a READ THIS BEFORE CHANGING IT note: the count may only ESCALATE an already-poisoned head, never classify one | 1 |
| `STAMP_TOLERANCE_MS` | **5 s** | `queueHealth.ts:114` | slack on "a stamp cannot be in the future". Written and read by the same device clock, so jitter is nil; wide enough that a rounded `now` cannot trip it, far narrower than the coarsest timezone step (15 min) | 1 |
| sync tick | **4 s** | `App.tsx:601` | **unrecorded — chosen without a written reason.** Reconstructible: it is the real floor on retry cadence, since a bill whose backoff expires waits for the next tick — so the effective first retry is 2–4 s, not `backoffBaseMs`. It is also exactly 10× the UI refresh tick, which may be intent or may be coincidence; nothing says | 1 |
| UI refresh tick | **400 ms** | `App.tsx:532` | **unrecorded — chosen without a written reason.** Reconstructible: the adjacent comment's "150 times" is derived FROM this value (60 000 / 400), so the comment reasons downstream of the tick rather than justifying it. Equal to `FORM_DEBOUNCE_MS`, with nothing linking them | 1 |

### Master-data freshness

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `PRICE_DEFAULT_CUTOFF_MS` ⚠ money | **12 h** | `freshness.ts:117` | the most argued number in the codebase — five reasons against a cutoff and four for, written out before choosing. "12 hours is the shortest window a normal working day cannot cross on its own… six would trip during a long afternoon with poor signal; twenty-four would sail straight through the overnight case that is the entire reason for the rule." Ends: "this number is a judgement, not a measurement" | 1 |
| `JUST_FETCHED_WINDOW_MS` | **5 min** | `freshness.ts:139` | "not zero because a refresh that completed ninety seconds ago is not something an operator needs a banner about, and a banner that is always on screen is a banner nobody reads" | 1 |

**RENAMED 2026-08-02, no value changed.** They were `PRICE_DEFAULT_MAX_AGE_MS`
and `FRESH_MAX_AGE_MS` — a shared `_MAX_AGE_MS` suffix on two numbers three
orders of magnitude apart, one cosmetic and one money-critical. They were mixed
up repeatedly, including in a phase brief, and **the failure mode is silent in
the dangerous direction**: reach for "the freshness constant", change the wrong
one, and the staleness banner goes quiet while the price gate stays exactly where
it was. Nothing fails and no proof goes red. Neither name is now readable as "the
freshness constant"; each doc comment names the other and states what changing it
does NOT do.

**One coupling found while renaming, and left in place:** `JUST_FETCHED_WINDOW_MS`
is also passed to `pastStampSuspect` as the tolerance on "a stored stamp cannot be
in the future" (`freshness.ts:242`). That is a reuse of the VALUE, not of the
meaning — 5 minutes suits both by coincidence of scale. So **tuning it for banner
reasons would also widen how far into the future a stamp may sit before the app
stops trusting its own ages**, which is the direction that defaults a stale price.
The call site now says so and says to give it its own constant before tuning.
Not split now: this section is bookkeeping, and splitting it is a behaviour change
however carefully done.

### Clock sanity

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `SEND_SCHEDULE_HORIZON_MS` | **15 min** | `clockSanity.ts:86` | 3× the true maximum any writer can produce today (5 min), "which leaves room for a knob to be raised without silently turning real schedules into 'clock moved'", and comfortably below the coarsest timezone step. `SyncEngine`'s constructor THROWS if `backoffMaxMs` or `masterDataRetryMs` ever exceeds it, so the two cannot drift in silence. Explicitly "a judgement, like POISON_ALARM_MS" | 1 |

### Transport timeouts

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `HttpTransport.timeoutMs` | **20 s** | `httpTransport.ts:84` | **unrecorded — chosen without a written reason.** Reconstructible: it is load-bearing for `MAX_ATTEMPT_CYCLE_MS`, whose comment names it as "the request itself (HttpTransport's 20s timeout)". Changing it silently changes the cap on a reported poison duration | 1 |
| daily-report abort | **20 s** | `api.ts:121` | matched to the above deliberately; the endpoint is a sequential scan over the tenant's whole bill history (see Known scaling limits), so the budget is generous on purpose | 1 |

### UI timing and touch targets

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `FORM_DEBOUNCE_MS` | **400 ms** | `App.tsx:109` | **unrecorded for the 400 itself.** The comment — "form keystrokes are written through on this delay; lines are written at once" — records the SPLIT (form debounced, lines immediate), which is the safety-relevant half: a money line is never left un-persisted waiting on a timer | 1 |
| `UNDO_MS` | **8 s** | `CartScreen.tsx:71` | **unrecorded — chosen without a written reason.** Reconstructible only that it bounds an undo of a deleted cart line, i.e. it is recoverable-by-retyping and not money already committed | 1 |
| `TAP_MIN` | **56** | `CartScreen.tsx:70` **and** `SellerPicker.tsx:37` | **unrecorded — chosen without a written reason.** What IS recorded is the RULE it serves (`CartScreen.tsx:6`, "every tappable thing is at least TAP_MIN tall"). Facts about the number, not reasons for it: 56 exceeds both platform minimums (iOS 44 pt, Android 48 dp). **Two findings beyond the value** — it is DUPLICATED in two files, free to drift; and the rest of the UI does not use it at all, with raw `minHeight` literals of 48 (×6), 44 (×4), 60 (×3), 36 (×2) and 72 — so **the stated standard is honoured in two screens and undercut in others** | 1 |

### Server

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `JWT_TTL_SECONDS` | **3600** (env-overridable) | `config.py:59` | **unrecorded — chosen without a written reason**, and its introducing commit says nothing about it either. It is nonetheless leaned on TWICE: `tokenStore.ts` uses "a stolen token is worthless within the hour" to justify persisting the token at all, and the sign-out blocker bounds its exposure with it. **A value two other decisions rest on, with no reasoning of its own** — if it were ever changed for an unrelated reason, both arguments would move without anyone revisiting them | 1 |
| `GET /bills` limit | **50 default, 200 max** | `bills.py:490` | **unrecorded — chosen without a written reason.** Note it is a different pair from the daily report's 200/500 in `reports.py`, with nothing recorded about why the two listing endpoints differ | 1 |
| `_DEFAULT_LINE_LIMIT` / `_MAX_LINE_LIMIT` | **200 / 500** | `reports.py:205-206` | the money is never paged — every total is a SQL aggregate over the whole day, computed independently of the line list, so a truncated list cannot produce a short total by construction. Only the LINES page | 1 |
| `_VOID_CAP` | **500** | `reports.py:210` | not paging, deliberately: "truncating the fraud-surveillance list is exactly the wrong thing to truncate, and voids are rare by nature". A hard cap purely so the response cannot grow unbounded; "a day that hits it is itself the finding" | 1 |
| `seller_code_target_holding` | **20** (per tenant, `NOT NULL DEFAULT 20`, floor of 1) | migration `0012`, column on `tenants` | **labelled an ASSUMPTION by the migration that creates it, in those words, which is what separates it from every "unrecorded" row above** — the reasoning is written down and says it is not a measurement. "The right target is a function of the walk-in rate and the longest offline stretch, and this repository measures neither." 20 is "a day's walk-ins at a yard busy enough to matter and small enough that the gaps from a lost handset are unremarkable". **THE FIRST ROW IN THIS TABLE THAT IS PER-TENANT AND CHANGEABLE WITHOUT A RELEASE** — every other value here is a literal in source, so a trial on this one is an UPDATE and leaves no commit for `git log -S` to find; a trial on it must be recorded HERE or nowhere. What settles it is a shop trading (P2.4); the floor of 1 is enforced by `ck_tenants_seller_code_target_holding` because zero would make offline seller creation permanently impossible while every screen reported a healthy device | 1 |

**THE DESIGN POINTS AT THE WRONG FILE FOR THIS LEDGER, AND THE POINTER IS LOOSE
RATHER THAN WRONG — noted 2026-08-25, and the design is NOT edited for it.**
`ROADMAP.md`'s seller-kind design says the target holding's value "belongs in this
file's tuned-constants ledger the day it lands", and *this file* there means
`ROADMAP.md`, which has no such ledger. The ledger is here, and `ROADMAP.md` itself
cites it correctly elsewhere as
`PROJECT_STATUS.md § Tuned constants — trial ledger`. The row above is recorded
where the ledger actually is. Recorded rather than repaired because the design was
already amended once this phase, by ruling, on one clause; a second edit for a
pointer would make "the design was amended" a sentence nobody can bound.

### Derived, NOT judgement — excluded on purpose

Listed so the next sweep does not add them to the table above. Changing any of
these means the thing it is derived FROM changed; they are not knobs.

- `MAX_ATTEMPT_CYCLE_MS` = **60 s** (`queueHealth.ts:106`) — the closest call in
  this list. It is *derived*: `HttpTransport`'s 20 s timeout plus `backoffMaxMs`
  (30 s in App.tsx), rounded up. But its own comment calls it "a guess like the
  two above", and the two inputs are themselves judgements — so **if either
  input is ever re-tuned this becomes a trial too**, and it is the one row most
  likely to be wrong without anyone noticing.
- `WEIGHT_MAX_INT_DIGITS` 11 / `MONEY_MAX_INT_DIGITS` 12 (`money.ts:45-46`) —
  read off `NUMERIC(14,3)` and `NUMERIC(14,2)`.
- `decimal.js` precision **50** (`money.ts:31`) — the domain needs ~28
  significant digits and the library defaults to 20, which would round mid-
  multiply (`lessons/decimal-precision-for-domain-scale.md`). The *margin*
  above 28 is a judgement; the floor is not.
- `WEIGHT_DP` 3 / `MONEY_DP` 2 — the column scales.
- `BE_YEAR_OFFSET` 543, `SHOP_UTC_OFFSET_MINUTES` 420 — facts, not choices.
  The offset becomes a per-tenant setting eventually; that is a schema change,
  not a tuning.
- `_VOID_CAP`-adjacent SQL limits, `DAY_MS` — arithmetic.

### The unrecorded values, and what could and could not be reconstructed

Nine values were chosen with **no written reason**, in the code or in their
introducing commit: the sync tick (4 s), the UI refresh tick (400 ms),
`HttpTransport.timeoutMs` (20 s), `UNDO_MS` (8 s), `TAP_MIN` (56),
`GET /bills` limit (50/200), both `backoff` knobs at their call site, and
`JWT_TTL_SECONDS`.

**Where the reasoning is genuinely unknown, the row says "unrecorded — chosen
without a written reason" and stops there.** Nothing has been back-filled with a
plausible-sounding justification. An invented reason is worse than a blank,
because a blank makes the next person ask and a plausible sentence makes them
stop — and it would be indistinguishable, a year from now, from a reason someone
actually had.

What IS in those rows is **reconstruction, clearly separated from justification**:
verifiable relationships between one value and another, found by reading the code
rather than guessed at. Those are worth having because they are what makes a
future re-tune dangerous:

- **the 4 s sync tick is the real retry floor.** A bill whose backoff has expired
  still waits for the next tick, so the effective first retry is 2–4 s, not
  `backoffBaseMs`. Anyone tuning the backoff and measuring no change would be
  looking at the wrong knob.
- **`backoffMaxMs` (30 s) sits inside `POISON_ALARM_MS` (90 s) about three
  times.** Raise it past 90 s and the clock trigger can no longer fire first —
  the count trigger becomes the only live one, with nothing announcing that.
- **`HttpTransport.timeoutMs` (20 s) and `backoffMaxMs` (30 s) are the two inputs
  to `MAX_ATTEMPT_CYCLE_MS` (60 s).** Neither has a recorded reason; a value with
  one is derived from two without.
- **the 400 ms refresh tick is upstream of the "150 times" in its own comment**
  (60 000 / 400). The comment reasons from the value; it does not justify it.
- **`TAP_MIN` (56) is a stated standard honoured in two screens and undercut
  elsewhere** — raw `minHeight` literals of 36 and 44 exist, both below it.

None of these values is wrong. All of them are **unaccountable**, which is a
different problem: an unaccountable value cannot be defended, cannot be safely
changed, and cannot be told apart from one that was measured. That is what this
ledger exists to stop compounding.

## Known stale references

Documentation drift found and not yet fixed. Recorded so it is not
re-discovered as a mystery.

- `mobile/src/device/expoSqliteDriver.ts:14` cites
  `tsconfig.device.json`, which no longer exists — the Expo app
  program is `tsconfig.json` (`npm run typecheck:app`). Comment only;
  no behaviour depends on it.
- `BRIEFING.md` says **"32 lesson files"**; there are **34**, and
  `lessons/README.md` indexes 34. Counted 2026-08-06. Prose only — but
  `BRIEFING.md` is the handoff for a reader who will NOT open the codebase, so
  it is the one file whose counts its own reader cannot check.
- **Re-counted 2026-08-07: there are now 36 lesson files and 36 index lines**
  (directory and index agree). The `BRIEFING.md` line above is therefore stale
  by four, not two. Counted with `ls lessons/*.md` excluding `README` and
  `all-lessons`, and `grep -c '^- ' lessons/README.md`.
- **A `CLAUDE.md` MACHINE FOOTGUN IS CONTRADICTED BY MEASUREMENT, and it is the
  one that was already written as a correction of a wrong correction.** The
  CRLF/BOM entry states, of `lessons/README.md`: "blob at `62cee25` CRLF 41/41,
  working tree at `62cee25` CRLF 41/41, blob at `9f929ad` CRLF 42/42, working
  tree CRLF 42/42". **The WORKING-TREE half is confirmed; the BLOB half is
  wrong.** Measured 2026-08-07 with `git cat-file -p` on the raw objects — the
  form that applies no filter, and the one that entry itself offers as the
  alternative to `git show`:

  | commit | blob sha | size | CR | LF |
  |---|---|---|---|---|
  | `62cee25` | `03224812…` | 24531 | **0** | 41 |
  | `9f929ad` | `dd4634ad…` | 25619 | **0** | 42 |
  | `3e2c996` | `dc12bbb7…` | 26222 | **0** | 42 |

  The working tree at `3e2c996` really is CRLF (`CR=42 LF=42`) with BOM
  `efbbbf`, and the blobs really do carry the BOM — so the BOM half of the
  exclusion argument stands untouched, and the CRLF half stands **for the
  working tree**, which is what `build_all_lessons.py` actually reads. **The
  exclusion of `lessons/README.md` from `all-lessons.md` is therefore
  unaffected**; what is wrong is only the claim about what is stored in the
  object database. **~~NOT CORRECTED — `CLAUDE.md` was out of scope for this
  work, and a footgun edited in passing is how the last two wrong versions of
  this one got written.~~** The irony is the point: that entry's own rule is
  "the working tree and the blob are two different objects… Measure the one you
  actually mean", and its numbers conflate exactly those two.

  **CORRECTED 2026-08-10, in the commit that carries this line. The 2026-08-07
  measurement above is left exactly as it was taken** — it was right, and a
  dated measurement is superseded rather than rewritten. The footgun was
  re-measured independently at HEAD `0241cc8`, and deliberately BEFORE this
  note was read, so the two are corroborating rather than one copied forward.
  They agree to the byte: blob `03224812` 24531 bytes CR=0 LF=41, blob
  `dd4634ad` 25619 bytes CR=0 LF=42. **Extended rather than merely confirmed:
  every one of the 45 commits that have ever touched `lessons/README.md` stored
  a blob with CR=0**, so there was never a CRLF blob for anyone to have been
  right about — at HEAD the blob is 51504 bytes CR=0 LF=54, against a working
  tree of 51558 bytes CR=54 LF=54, BOM `efbbbf` on both. The entry now carries
  both objects in a labelled table with the commit and the commands, and its
  `git show` instruction is replaced: on this box a native command's output
  reaches PowerShell as an array of lines with every ending already stripped,
  so a line ending read that way describes the writer and not the blob. **What
  is NOT established is which command produced the original wrong figure**, and
  the entry records that as unestablished rather than guessing it.

*(The `httpTransport.ts:18-23` entry that stood here — "403 stays, the server
has no permission model in the MVP" — is CLOSED. The client was taught the 403
in the phase below, and the comment now records what it cost rather than
asserting the opposite of the code.)*

## SRS references

**THE SRS IS NOT IN THIS REPOSITORY.** The owner holds it. Everything
below is a TRANSCRIPTION, confirmed by the owner on 2026-07-28, recorded
only so a session that cannot read the document does not have to guess at
it. It is not the source of truth and must not be treated as one: if it
disagrees with the owner, the owner is right. Code comments citing "SRS
1.6" throughout `server/` refer to this.

### SRS 1.6 — seller (ผู้ขาย) fields

| SRS field | Column | Notes |
| --- | --- | --- |
| code | `sellers.code` | the PK in SRS terms; here a `uuid` PK plus `UNIQUE (tenant_id, code)`, and immutable after create |
| customer grade | `sellers.grade` | nullable, `A`–`D`; selects the `product_prices` tier |
| national ID / juristic person number | `sellers.id_number` | nullable free text |
| name | `sellers.name` | required |
| address | `sellers.address` | nullable |
| phone | `sellers.phone` | nullable |
| vehicle registration | `sellers.vehicle_no` | nullable; the seller's USUAL vehicle — not `purchase_bills.vehicle_no`, which is the truck that turned up on the day |

Added by migration `0004`: `id_number`, `address`, `vehicle_no`.

**Why `id_number` is free text with no format check and no UNIQUE**, and
why that is the spec's own shape rather than a shortcut: the SRS names the
field "national ID / juristic person number" — นิติบุคคล, juristic person,
is in the document itself. A personal ID and a company registration number
are both 13 digits but are DIFFERENT SCHEMES, so a single format check
would reject one of the two kinds of seller a yard actually buys from. And
a walk-in may carry neither. A UNIQUE would additionally turn a typo in one
seller's row into a refusal to create an unrelated one. If the office wants
duplicates surfaced, that is a report, not a constraint.

## Baseline observations

Dated, because they decay. Re-run them; do not cite them.

- 2026-07-27 — `npm run typecheck` → exit 0, and
  `npm run typecheck:app` → exit 0, each run bare.
- 2026-07-27 — `recycle_pg` up and `(healthy)` on `5544->5432`.
- 2026-07-28 — `prove_backup_restore.py` → exit 0 twice in a row
  against the live database, no reseed between.
- 2026-07-28 — disaster-recovery rehearsal on a THROWAWAY empty
  cluster (`postgres:16`, no `db/init`, no migrations, no seed):
  `restore_db.py --into recycle --with-globals` rebuilt roles,
  database and all 727 rows; uvicorn against it answered
  `POST /auth/login` 200, `GET /bills` 50 bills, item weights and
  money identical to the source, and A's password against tenant B
  still 401. The throwaway cluster was removed afterwards.
- 2026-07-28 — restore safety gates each observed refusing:
  overwriting the live database without `--overwrite-live`, a
  truncated dump (sha256 mismatch), and a body containing `\connect`
  with valid checksums.
- 2026-07-28 — `prove_master_write.py` → exit 0 TWICE in a row against
  the live database, no reseed between, no run fixtures left behind.
- 2026-07-28 — migration `0004` applied to the live database; columns
  verified from `information_schema` (four `is_active` NOT NULL DEFAULT
  true, three nullable seller fields).
- 2026-07-28 — retirement proven end to end: FE-STEEL retired while an
  existing bill referenced it; the bill answered 200 with
  `product_code='FE-STEEL'`, `product_name='Steel scrap'`, every money
  and weight column byte-identical, doc_no and total unmoved. A new bill
  against it in that state was 424 `product_inactive` and wrote no row;
  after reactivating, the identical payload was accepted.
- 2026-07-28 — ALL EIGHT pre-existing server proofs re-run bare and
  green after the auth/bills/db changes AND again after 0004:
  `prove_auth`, `prove_bills`, `prove_rls`, `prove_master`,
  `prove_master_data_gate`, `prove_shop_time`, `prove_seller_pricing`,
  `prove_backup_restore`.
- 2026-07-28 — the concurrent same-key race observed directly: two
  overlapping submits (37.5 ms of measured overlap) returned
  `[200, 201]` with exactly one bill. Before the fix that path was a
  500.
- 2026-07-29 — all TWELVE mobile proofs green TWICE in a row, and both
  TypeScript programs (`typecheck`, `typecheck:app`) exit 0, each run
  bare. `prove:forbidden` ran against the live API both times with no
  reseed between (its own bills were `B-2569-218` then `B-2569-219`).
- 2026-07-29 — **device pass, real iPhone, staff account.** No void
  button under the staff role. With the button forced on, one tap
  produced exactly ONE `POST /bills/{id}/void -> 403` in the uvicorn log
  and NOTHING for the following minute — it is the last line in the log.
  Postgres on that bill (`B-2569-222`): `voided_at NULL`, `voided_by
  NULL`, `void_reason NULL` (read as hex, per the codepage-874 footgun),
  `total_amount 220.00`, still active. The screen: red card, badge
  `ไม่มีสิทธิ์ยกเลิกบิล`, total NOT struck through, no `ยกเลิกแล้ว`, no
  `ติดต่อฝ่ายสนับสนุน`, no sign-in prompt. Signing back in as admin
  retracted the refusal and applied the ORIGINAL void.
- The two temporary device-test edits (`app/config.ts` DEMO switched to
  the staff account, `role={null}` on BillsPanel) were reverted before
  the commit and are NOT in the tree.
- 2026-07-29 — **first Android pass ever**, borrowed handset. Scope and
  the much larger not-scope are in Known device gaps above.
- 2026-07-29 — **two devices, one tenant, no collision and no gap.**
  Read out of `purchase_bills`, not off the screens: `B-2569-222` (iPhone,
  220.00), `B-2569-223` (Android, 11007.50), `B-2569-224` (Android, 210.00),
  `B-2569-225` (iPhone, 1075.00) — contiguous, one bill each, no duplicate and
  no skipped number. Devices identified from the uvicorn log by client IP.
  222 is NOT a fresh tap: it is the same row as the 403 pass above, 39 minutes
  earlier, so the ordering claim iOS-then-Android holds and the "back to back"
  impression does not.

  **COMPRESSED 2026-08-06** — the per-device `device_created_at` /
  `server_received_at` table and the DHCP-lease reasoning are removed. Kept
  because the entry below cites it: `B-2569-225` carries the earlier
  `device_created_at` by 125 ms and arrived 158 ms later. **These four rows no
  longer exist in the dev database** — dropped by the 2026-08-03 rebuild and
  surviving only in the `pre-rebuild` dump, so the removed detail could not be
  re-queried either way. The observation stands as recorded.

- 2026-07-29 — **doc_no and weighing order DISAGREE across devices, and
  that is correct.** In the offline pair above, B-2569-225 carries the
  EARLIER `device_created_at` (by 125 ms) and the LATER doc_no, because
  it arrived 158 ms after the other. Nothing is wrong: doc_no is arrival
  order (`lessons/doc-no-is-arrival-order-not-event-time.md`), the
  strict weighing-order guarantee is a property of ONE device's send
  queue, and there is no shared queue across two phones. The 125 ms is
  also not evidence of anything — it is the difference between two
  untrusted device clocks, and ~3 s of real skew has been measured on
  this hardware before. Recorded here so it is not re-discovered as a
  bug: any report that orders bills by `device_created_at` across
  devices is wrong, and must key on `server_received_at`.

- 2026-07-29 — **`prove_daily_report.py` green TWICE in a row** against the
  live database, no reseed between (63 checks). Its fixtures sit on a
  synthetic day, 2019-03-14, so no real trading day is disturbed; they are
  LEFT IN PLACE (hard rule 5) and every assertion is a set-membership or a
  DELTA, which is why run 2 passes while the day's total doubles.
- 2026-07-29 — **the day boundary, with the wrong answers measured beside
  it.** Same fixtures, one list price of 15.00, three aggregation bases:

  | basis | day total | which fixtures it counts |
  |---|---|---|
  | `server_received_at` + shop tz (**shipped**) | **3053.00** | edge_first, edge_last, on_list, off_list |
  | `server_received_at` + UTC day | 3398.00 | drops edge_first, ADDS edge_after + late_sync |
  | `device_created_at` + shop tz | 3278.00 | drops edge_first, ADDS late_sync |

  A UTC day is off by 345.00 and a device-clock day by 225.00 on nine
  bills. Both edges hold exactly: `00:00:00.000000+07` is IN,
  `23:59:59.999999+07` is IN, and the two instants one microsecond outside
  are OUT (half-open, so midnight is counted once, never twice).
- 2026-07-29 — also observed through the real endpoint: a voided bill
  absent from the total and present in the void list with reason/who/when;
  a void performed against a five-day-old bill appearing ONLY in
  `voids_applied`, flagged `from_earlier_day`; an off-list bill flagged
  and an on-list one not, with `off_list_variance` exact to the baht; a
  staff token 403 `kind: forbidden`; tenant B's day invisible to A and
  visible to B; every money value an exact 2-dp string with no JSON float
  anywhere in the body; `limit=1` returning one line and identical totals;
  a future date refused 422; and `SHOW transaction_isolation` answering
  `repeatable read` for the report and `read committed` by default.
- 2026-07-29 — ALL NINE pre-existing server proofs re-run bare and green
  after the `reports.py` / `db.py` / `main.py` changes.
- 2026-07-29 — **`prove_master_write.py` went red, and it was the
  assertion, not the code.** `len(with_inactive) == len(default_list) + 1`
  assumed this run's product was the tenant's only retired row. A bill
  from 2026-07-28 (`mw-f0c445f2-inactive`) had been written against that
  run's OWN seller and product, so hard rule 5 pins both forever and its
  cleanup could not remove them — two inactive products, and `+ 1` false.
  Rewritten as a set difference; green twice. **The debris is permanent
  and is still there** (`PROD-f0c445f2`, `SELL-f0c445f2`, both retired,
  both pinned by bill `B-2569-194`): it cannot be cleaned without deleting
  a transaction. Third instance of this assertion shape — see the third
  amendment to `lessons/proof-must-run-twice.md`. Every other proof script
  was grepped for the same shape; the rest are distinctness or per-run
  claims and are sound.
- 2026-07-29 — note for whoever runs the proofs next: `prove_master.py`
  defaults to `API_BASE_URL` **8000** while `prove_master_write.py` and
  `prove_daily_report.py` default to **8099**; `mobile/src/proof/
  proveForbidden.ts` F6 defaults to **8000** via `RECYCLE_API_BASE`. A bare
  run against the wrong port fails with `httpx.ConnectError` / a transport
  error, which looks exactly like a dead server. Set the base URL
  explicitly.
- 2026-07-29 — **full sweep of every proof, server and mobile, for
  assertions that measure the fixture rather than the behaviour.** Five
  fragile ones found and fixed; the rest judged sound with the reason
  recorded in-line so the next sweep does not churn them. The fixed ones:
  two BE-year time bombs (`prove_bills.py` derived the year from
  `datetime.now(utc).year + 543`, the exact expression
  `lessons/be-year-comes-after-the-timezone.md` exists for;
  `prove_master_data_gate.py` hardcoded `2569` in two SQL predicates and a
  doc_no regex — all four would have gone red on 2027-01-01 over a defect
  the code does not have); a seed-value literal (`prove_master.py` asserted
  `'"15.00"' in raw` for a price three other scripts mutate and restore, so
  its green depended on everyone else's cleanup); an order-dependent index
  (`sb[0]["id"] != sa[0]["id"]`, which could not fail while the
  disjointness check above it held, and would IndexError the day a tenant
  has no sellers — removed, not repaired); and one of my own in
  `prove_daily_report.py` (`len(cannot_know) >= 3` would have stayed green
  against three empty strings; it now asserts the substance).
  **The mobile proofs are sound as a class and were not churned:** they
  build their world per run in `mkdtempSync` temp dirs or in-memory stores,
  so a count there measures the fixture the test itself just created, which
  IS the behaviour under test. Their absolute doc_nos (`proveClock.ts:341`,
  `B-2569-1,2,3`) come from FAKE servers whose counter resets each run, not
  from the real one. The single mobile proof that touches the live API
  (`proveForbidden` F6) captures the server-assigned `doc_no` and compares
  back rather than asserting a literal.
- 2026-07-29 — **repo-wide sweep for BE-year / shop-date / day-boundary
  derivations that bypass the shop-time module** (`+543`, `.year`,
  hardcoded 2569/2570, SQL date literals, UTC date arithmetic), server and
  mobile, production and proofs. **No new defects: the only four were the
  ones fixed in `af11f71`.** The full inventory, so it is not re-derived:

  | site | verdict |
  |---|---|
  | `server/app/bills.py:139` `_be_year` | SOUND — the one authority |
  | `server/app/reports.py:242,269` | SOUND — converts to shop tz first, then `.date()`; label uses `_be_year` |
  | `server/scripts/prove_backup_restore.py:70,191` | SOUND — already imported `_be_year` with "never re-derive +543". The model the other two should have followed |
  | `server/scripts/prove_shop_time.py:89,98,194` | SOUND BY INTENT — the UTC expression is the DISPROOF, and :194 is guarded by `if utc_be != expected_be` |
  | `server/scripts/prove_daily_report.py:339` | SOUND BY INTENT — deliberately the wrong UTC boundary, for the disproof |
  | `server/scripts/prove_daily_report.py:115,509` | SOUND — builds shop-time instants; converts before `.date()` |
  | `packages/shop-time/src/shopTime.ts:127` | SOUND — the one client authority; `getUTCFullYear()` on an already-shifted branded `ShopWallClock` |
  | `mobile/src/proof/proveTime.ts:134,155,168` | SOUND BY INTENT — UTC slice and `getHours()` shown as the CONTRAST |
  | `proveTime.ts:125-128,223-226`, `proveClock.ts:624,707` | SOUND — fixed input instant → fixed expected string. A constant mapping is correct forever; only a derivation from the CURRENT clock is a time bomb |
  | `mobile/src/proof/fakes.ts:452`, `fileServer.ts:59` | SOUND, deliberately frozen — making the fake derive the real year would add a clock dependency to deterministic tests, and nothing compares fake doc_no to a computed year |
  | `proveClock.ts:341`, `proveSync.ts:169`, `proveForbidden.ts:513`, `proveNotice.ts:453`, `proveSeller.ts:856` | SOUND — literal doc_nos compared against the FAKE's own output; doc_no is an identifier, never a date |
  | every mobile date shown to a human | SOUND — `freshness.ts`, `BillsPanel.tsx`, `StatusStrip.tsx` all render through `shopTime`; no other file imports it and none formats a date without it |
  | SQL date literals | NONE anywhere — `server/db/init/00_init_roles.sql` has no date logic, migrations use `timestamptz DEFAULT now()` (instants, not dates) |
  | `mobile/dist/` | NOT TRACKED by git — the `shopTime.d.ts` copy there is build output, types only, no logic |

- 2026-08-02 — **all THIRTEEN headless mobile proofs green TWICE in a row**, each
  run bare, and both TypeScript programs (`typecheck`, `typecheck:app`) exit 0,
  each run bare. `prove:daily` is new: 11 report shapes and 13 non-report
  outcomes, including the four disproofs (a `toFixed` round trip changing
  `99999999999999999.99`; a flag-gated understatement line going silent; the void
  wording that `admin_required` used to carry; a screen with a total field showing
  `0.00` during an outage).
- 2026-08-02 — **`prove:forbidden` green TWICE in a row** against the live API, no
  reseed between (`recycle_pg` up and `(healthy)` on `5544->5432`; uvicorn
  answering `/health` 200 on 8000, which is F6's default port). Its F6 created
  `B-2569-303`, was refused the void as staff, read `code=admin_required` off the
  real body, confirmed the server still held the bill ACTIVE with its money
  unchanged, and then voided the SAME bill as admin. Earlier in the day this
  script could not be run at all — Docker was down — and that is why it is a
  separate line rather than folded into the thirteen above.
- 2026-08-02 — **device pass, real iPhone, daily money screen, ADMIN account.**
  Four steps correct (render, timestamps, day stepping, offline); the staff 403
  step could not be exercised because the Keychain token survives deleting Expo
  Go. Read out of the uvicorn log, not off the screen: every request from the
  phone (`.249`) → **200**; `curl` from the box (`.238`) with a real staff token
  → **403** `kind=forbidden` `code=admin_required` `actual_role=staff`. The
  server gate is observed; the screen's rendering of it is not.
- 2026-08-02 — **the two freshness thresholds renamed, values byte-identical.**
  `PRICE_DEFAULT_MAX_AGE_MS` → `PRICE_DEFAULT_CUTOFF_MS`, `FRESH_MAX_AGE_MS` →
  `JUST_FETCHED_WINDOW_MS`. Verified from the diff that only the identifiers moved
  (`12 * 60 * 60 * 1000` and `5 * 60 * 1000` unchanged on both sides). ALL
  THIRTEEN proofs green afterwards — including `prove:cold`, which asserts on both
  thresholds directly and prints them — and both TypeScript programs exit 0, each
  run bare.
- 2026-08-02 — one FALSE POSITIVE found and fixed in the new proof itself:
  `proveNotice`'s banned-fragment list, copied over, read the legitimate count
  `รวม 500 ใบ` as a leaked 5xx status. Replaced with a regex over the whole class,
  applied only to the screens that carry no counts — which also catches 418.
- 2026-08-03 — **THE DEV DATABASE WAS REBUILT, and the checker is green.**
  Sequence, each step observed before the next began: both proof scripts fixed
  and green twice → `backup_db.py --label pre-rebuild` (1207 rows) →
  **restored into `recycle_prerebuild_verify` and row-count-verified BEFORE
  anything was destroyed** → `docker compose down -v` → `up` → `recycle_pg`
  `(healthy)` on `5544->5432` → `alembic upgrade head` (0001→0004) →
  `seed_dev.py` → uvicorn → **all nine server proofs green** → `reconcile.py`
  **exit 0, 44 checks, 2 tenants, 0 violations, 0.2s, run bare TWICE.**
  No transaction row was deleted to reach green: the volume was replaced whole,
  not pruned. No violation survived that was not proof debris.
  Before/after: 48→2 tenants, 402→27 bills, 428→28 items, 50→4 users.
  The pre-rebuild dump's three files re-verified by sha256 afterwards, all OK.
- 2026-08-03 — **the two fixed proof scripts add ZERO violations.** The same two
  that took the checker 84→96 in one round were re-run against the old database
  before the rebuild: it stayed at 96. That measurement is why the order was
  fix-then-rebuild and not the reverse.
- 2026-08-03 — **`prove_rls.py`'s teardown proven to survive a failure**, by
  injecting a `RuntimeError` mid-proof and observing the teardown banner, 9 rows
  removed per tenant and "nothing left in any of the 9 tables" printed BEFORE
  the traceback. The injection was reverted and its absence verified by grep.
- 2026-08-03 — **the server on 8000 was restarted from the current tree and
  confirmed FROM A RESPONSE**, not from the process list: the old PID was killed
  and `/health` observed refusing (`000`), then the new process started and
  `/health` answered **200 on `127.0.0.1:8000` AND on `192.168.1.238:8000`** —
  the exact `apiBaseUrl` in `mobile/app.json` — plus `POST /auth/login` 200.
  **The phone will nonetheless have to sign in again**: `seed_dev.py` lets
  `users.id` default to `gen_random_uuid()`, so the rebuilt admin/staff rows
  have new ids and the Keychain token names a user that no longer exists.
  Tenant, seller and product ids are fixed constants and did not move.
- 2026-08-02 — **the two-clock defect, MEASURED before and after the fix.** Same
  script, same lie (Python's clock inside `app.bills` set to
  `2027-01-01T00:00:05+07`, BE 2570; Postgres left on the real 2026-08-02, BE
  2569), same real `create_bill`, a restored scratch copy each time:

  | | doc_no minted | `server_received_at` | `doc_no_counters` |
  |---|---|---|---|
  | **before** | `B-2570-1` | 2026-08-02 (BE 2569) | **`{2569: 305, 2570: 1}`** — a counter opened for a year that has not happened |
  | **after** | `B-2569-306` | 2026-08-02 (BE 2569) | `{2569: 306}` — 2570 `last_seq` before=None after=None |

  Offline, the same `_be_year` over the two instants a straddling transaction
  really produces: `2026-12-31T23:59:59.900+07` → BE **2569**, and
  `2027-01-01T00:00:00.050+07` → BE **2570**. **150 ms apart, one Buddhist year
  apart.** Post-fix the two bills of a run are consecutive in ONE series
  (`B-2569-306` then `B-2569-307`), which they were not before (`B-2570-1` then
  `B-2569-306`). `prove_docno_clock.py` green TWICE in a row with no reseed
  (306/307, then 308/309 — every assertion is a delta).
- 2026-08-02 — **all NINE pre-existing server proofs re-run bare and green after
  the `create_bill` change**, against a uvicorn started from the fixed code on
  8099 (`/health` 200 observed first — the process already on 8000 was NOT
  assumed to be running the new code): `prove_auth`, `prove_bills`, `prove_rls`,
  `prove_master`, `prove_master_data_gate`, `prove_shop_time`,
  `prove_seller_pricing`, `prove_master_write`, `prove_daily_report`,
  `prove_backup_restore`. `prove_shop_time` is the directly relevant one — it
  asserts the counter row `(tenant, 2569).last_seq` holds the bill's own seq, and
  did.
- 2026-08-02 — **the debris grows with every proof run, measured.** One round of
  the proofs above took the reconciler from **84 violations over 46 tenants to 96
  over 48** — `prove_rls` +2 tenants and +2 NULL-doc_no bills, `prove_daily_report`
  +10 mis-yeared fixtures. No NEW violation class appeared, so the fixed
  `create_bill` writes clean rows. **This is the evidence behind the
  recommendation above being "fix the scripts THEN rebuild", in that order: a
  rebuild alone would have been undone the same day.**
- 2026-08-02 — **`reconcile.py` against the LIVE database, run bare TWICE.**
  Both runs byte-identical apart from the start stamp and elapsed: 46 tenants,
  **792 checks, 84 violations (T5: 44, T7: 40), exit 1, 0.9s.** The two runs
  were taken before and after the whole injection exercise, so they are also
  the observation that the live database was never touched by it.
- 2026-08-02 — **`prove_reconcile.py` green TWICE in a row**, no reseed between
  (it restores the copy itself each time). **118 assertions, 0 failures, 19
  injections.** Read out of the run rather than asserted:
  - the copy arrives carrying the live database's `84 violations {T5: 44,
    T7: 40}`; the two normalisation statements report `DELETE 44, DELETE 44`
    and `UPDATE 40`; the copy then runs `exit 0, 0 violations`. That is the
    proof that those two causes account for all 84.
  - every injection produced EXACTLY the predicted check ids and counts, named
    the row, and cleared on undo. Samples: `T1` → `doc_no=B-2569-2
    difference=0.01`; `T2` → `stored_amount=5.01 expected_amount=5.00` with T1
    silent (the total was moved with it, so only the arithmetic check can see
    it); `T3` → `{S5: 1, T3: 1}`, the CHECK had to be dropped first and S5 saw
    that too; `T8` → `MISSING seq=[2] highest=306` plus `counter_last_seq=305
    highest_doc_no=306 difference=-1`; `T10` → `{S5: 1, T10: 1, X1: 1}`, one
    cross-tenant seller seen by three lenses at once; `T16` → `{S5: 1, T16: 1,
    T8: 2}` (a gap AND a duplicate).
  - **RLS off on `tenants`** → `{S3: 1, B1: 1, B2: 1, T0: 91}` — the sweep's own
    context self-check screams before any money check does.
  - **RLS off on `purchase_bills`** → `{B1: 1, B2: 1, S3: 1, X2: 1, T1: 13905,
    T4: 13905, T10: 16470, T16: 184, T8: 184, T9: 45}` = **44 697 violations**.
    Every tenant sees every bill and only its own items.
  - a row landing mid-run is reported by X3 (`rows_at_start=46 rows_at_end=47`),
    not absorbed; a refused admin connection exits **2**, and so does a
    database that does not exist.

  **DECAYED — this green has not held since 2026-08-03, and the cause is not
  R1.** The 118 assertions above were written against the pre-rebuild
  46-tenant database. The 2026-08-03 rebuild took it to 2 tenants, and three of
  them are absolute counts of a database that no longer exists:
  `prove_reconcile.py:634` `{"T0": 91}`, `:636`
  `rows_visible_with_no_tenant_context=46`, and `:718` `rows_at_start=46
  rows_at_end=47`. **Measured either side of migration 0005, not inferred:** it
  fails from a pre-0005 dump (48 tenants, `T0` got 95), from a second pre-0005
  dump (3 tenants, `T0` got 3), and identically from a post-0005 dump — the
  same four failures throughout, so `token_version` is not involved. **What
  still stands: every injection that is about MONEY still passes.** Only the
  two tenant-count assertions and the X3 timing probe fail, so what decayed is
  the proof's expectations about its own fixture, not the checker's ability to
  see a money defect. Tracked in `OPEN_ITEMS.md`; fixing it means deciding what
  those numbers should be derived FROM, which is a change to a destructive
  proof and not one to make in passing. Fifth bite of
  `lessons/proof-must-run-twice.md`, in the very file its fourth amendment was
  written about.
- 2026-08-02 — one wrong PREDICTION found by the harness, in the harness:
  renumbering the TOP bill to `B-2569-99999` was expected to report
  `MISSING seq=[305]`. The checker instead reported 99 694 missing numbers,
  which is correct — if the highest issued number is 99999 then 1..99998 must
  all exist. The injection was changed to a realistic hand-renumber (one past
  the top); the checker was not changed.
- 2026-07-29 — **proof debris measured, tenant A: 301 bills, 248 active, 53
  voided**, by originating script. Only `prove_backup_restore` left nothing
  live, because it is the only one that voids its own fixture. **37 active
  proof bills had landed on the real current day**, mixed in with the 4 real
  device bills on a day `GET /reports/daily` shows.

  **SUPERSEDED by the 2026-08-03 rebuild, and COMPRESSED 2026-08-06** — the
  per-script breakdown and the pinned `PROD-f0c445f2` / `SELL-f0c445f2` pair
  are removed. Every row counted here is gone, including that pair, which was
  described at the time as permanent and uncleanable: it was, by any means
  short of replacing the volume. **The SHAPE of the finding still holds** and
  is why the OPEN DECISION on a shared proof teardown is still open — proof
  bills that land on the real current day are still indistinguishable from
  trade in the daily report, and the counts will climb again from zero.

### 2026-08-06 — device pass, real iPhone (R1b and R2)

Transcribed from the operator's record, which existed in no file in this
repository before this entry — verified by grep for `403` and `16:0` across the
repo, which returned only the 403 *class* as discussed in `lessons/` and code,
one DIFFERENT 403 observation from 2026-07-29
(`lessons/403-is-about-what-the-caller-may-do.md:150`, a void on iPhone `.243`),
and two unrelated ISO timestamps. Every line below was read from a uvicorn log
or from Postgres **except where it says it was read off the screen.**

DEVICE PASS 2026-08-06, real iPhone, R1b and R2.

R1b — sign-out, all cases passed on the handset.
- Booting with an OLD token in the Keychain carrying no version claim:
  GET /products and GET /sellers both 401. The app drew "หมดเวลาเข้าใช้งาน
  — ต้องเข้าสู่ระบบใหม่ บันทึกบิลได้ตามปกติ". It did NOT default to
  letting the session through.
- The pending gate works both ways: an empty queue drew "บิลทั้งหมด
  ส่งขึ้นระบบครบแล้ว" and released; one queued bill drew "ยังออกจาก
  ระบบไม่ได้ / มีบิลรอส่งขึ้นระบบ 1 ใบ" and refused.
- A draft survived the sign-out: a 4-line cart totalling 4384.20 was
  left in the basket before signing out and was still whole after
  signing back in. Off the screen at 16:07, bill B-2569-68 carries
  4 รายการ / 4384.20 — the operator confirms this is that same cart,
  saved and synced after the sign-out.
- The Keychain really cleared: after signing out the screen read
  "ยังไม่ได้เข้าสู่ระบบ", different wording from "หมดเวลาเข้าใช้งาน",
  so the two states are distinguishable on the device and not only in
  the proof.
- Hard rule 3 on the screen: a bill that has not reached the server
  showed "ยังไม่มีเลขที่" rather than a fabricated number.
- The 12-hour price gate fired on real hardware for the first time:
  a 3-day-old cache drew the amber band and the system did not fill
  the price in — the operator typed it.

R2 item 1 — the 403 rendering, drawn on a device for the first time.
- GET /reports/daily from the handset (192.168.1.249:64623) -> 403
  Forbidden, after that same socket's own POST /auth/login 200 and
  GET /products, GET /sellers 200. It is the ONLY 403 in the log, and
  it came from the phone's address, not from curl on the box.
- Off the screen (16:06): a red card, badge "ไม่มีสิทธิ์ดูยอดประจำวัน",
  body "บัญชีนี้ดูยอดเงินประจำวันของร้านไม่ได้ — ต้องแจ้งเจ้าของร้าน".
  NO money field appears anywhere on that screen — not a zero, not a
  dash: total, void list and off-list line are all absent. That is
  A1's design holding on a real handset: the leak is unrepresentable
  rather than guarded.
- Off the screen (16:07): the bill list under the same staff session
  replaced the void control on all three bills with "ยกเลิกบิลได้
  เฉพาะบัญชีเจ้าของร้าน". No void request was attempted and none
  appears in the log — the client refused before the wire. This
  observation therefore says NOTHING about the server's void gate,
  which is proven separately (prove:forbidden F6).
- Limit of this observation: the uvicorn lines carry no timestamps.
  The 403 is tied to the screenshot by being the only one in the log
  and by its source address, not by clock.

R2 item 2 — the 20 s transport timeout, staged for the first time.
WEAKER EVIDENCE THAN THE ABOVE, and recorded as such.
- Staged as a socket that completes the TCP accept and then never
  answers. It is not uvicorn, so the uvicorn log contains NO line for
  it. That absence is expected and is not evidence of anything.
- Off the screen (16:09): badge "ยังติดต่อระบบไม่ได้", body "หน้ายอด
  ประจำวันต้องอ่านตัวเลขจากระบบ ... ยังไม่ได้ตัวเลขจากระบบ จึงยังไม่
  แสดงยอด — ไม่ได้แปลว่าวันนี้ไม่มีการซื้อขาย บิลที่บันทึกไว้ยังอยู่
  ครบทุกใบ", plus a "ลองอีกครั้ง" button. No money field. The day did
  not render as 0.00.
- WHAT THIS DOES NOT ESTABLISH: the ~20 s was watched by the operator,
  not measured, and this is the same screen a REFUSED connection would
  produce. What is proven is that a hung socket ends in the no-number
  outage screen instead of a zero. That it ended at the 20 s ceiling
  specifically, rather than at some other transport failure, rests on
  the operator's stopwatch and nothing else.

- 2026-08-06 — **proof and typecheck runs, READ OUT OF THE TWO COMMIT BODIES,
  not re-run in this documentation phase.** From `7484645`: `prove:signout`
  green TWICE bare with no reseed between the runs, and **both TypeScript
  programs — the node program and the Expo app program — exit 0**. The other
  THIRTEEN mobile proofs were green twice each *earlier in that session*,
  **against a tree differing from the committed one only in
  `proveSignOut.ts`**. That hedge is the commit's own and is kept deliberately:
  it is NOT the same claim as all fourteen green twice on the committed tree,
  and the difference is exactly the kind a later session would round off.
  From `19a6b63`: nine server proofs green plus `prove_backup_restore`, and
  `reconcile.py` against the dev database **exit 0, 44 checks, 0 violations,
  unchanged**. `prove_reconcile.py` was already RED for reasons predating that
  change — see the decay note above.
- 2026-08-06 — **`START_HERE.md`'s citations moved from line numbers to
  section-plus-handle, and the move was DISPROVEN rather than reviewed.**
  `tools/verify_citations.ps1` parses the citations out of `START_HERE.md`
  itself — it carries no list of its own — and asserts each resolves to exactly
  one place: **36 citations, 0 broken, exit 0**, run bare from its committed
  location. Three things it caught, all before the commit:
  - **Three handles were line-WRAPPED** inside `START_HERE.md`, making them
    strings that exist on no single line of the file they point at. First run:
    `BROKEN=3`. The one-line rule now in `START_HERE.md`'s header was found by
    RUNNING the check, not by reasoning about it.
  - **The shift disproof.** A blank line inserted near the top of `CLAUDE.md`
    (above Scope and status) moved every section — 51→52, 70→71, 165→166,
    197→198 — and every handle with them; all 36 still resolved. Repeated on
    `PROJECT_STATUS.md` (Current phase 50→51, What is built 692→693, Baseline
    observations 1291→1292): all 36 still resolved. Both files then restored and
    verified byte-identical by sha256. Line citations would have failed both.
  - **A negative control.** One handle altered to a string absent from its
    target: that citation alone reported `hits=0`, `BROKEN=1`, exit 1. Restored,
    back to exit 0. The green has been observed going red.
- 2026-08-06 — **the checker's FIRST run from `tools/` was a FALSE GREEN, and the
  cause is this box rather than the citations.** It printed `CITATIONS=3
  BROKEN=0` and **exited 0** when there are 36. The section mark had been written
  as a literal character in the `.ps1`; **Windows PowerShell 5.1 reads a BOM-less
  script as the ANSI codepage, which is 874 here**, so the regex silently stopped
  matching every citation carrying a section and the run reported success over
  the 3 that remained. It was caught only by comparing 3 against a count already
  known to be 36 — nothing in the output said anything was wrong. Fixed twice
  over: the source is ASCII-only with the mark built from its codepoint, and the
  run now asserts that sectioned citations parsed equals sectioned citations
  present. That control has itself been seen firing (35 vs 33, while its own
  count regex was still too loose) and then corrected. **A machine-footgun entry
  in `CLAUDE.md` is OWED and is NOT written** — this is the codepage-874 trap in
  SOURCE rather than in data, a form the existing entry does not cover, and
  `CLAUDE.md` was out of scope for this commit.
- 2026-08-07 — **the section-and-handle citation form survived a REAL insert for
  the first time, and the shift it survived was 22 lines, not one.** The staged
  disproof recorded above moved a blank line and put it back; this was a
  committed edit that added a 22-line machine-footgun entry to `CLAUDE.md`.
  **The shift was not uniform, and it split a cited section down the middle.**
  `Scope and status` stayed at 51 and the `Machine footguns` heading stayed at
  70 — both sit at or above the insert point — while `Boot check` moved 165→187
  and `Workflow` 197→219, and the two handles INSIDE `Machine footguns` moved
  90→112 and 98→120 with them. A line citation into that one section would have
  been right for the heading and 22 lines wrong for its own handles, in the same
  breath. **All 25 citations into `CLAUDE.md` still resolved**, inside a run of
  37 (36 before, plus the one this commit adds to `START_HERE.md`): 0 broken,
  exit 0, control 34 sectioned present and 34 parsed, run bare. The prior this
  is measured against — a three-line insert that once invalidated all twenty
  pointers at once — is recorded at `tools/verify_citations.ps1` lines 5-7 and
  is NOT re-measured here; what is new is only that the form has now held
  through an edit somebody actually made, an order of magnitude larger than the
  staged one. Same commit, and stated so the two are not read as one claim: the
  machine-footgun entry the note above records as OWED is now written, and
  `START_HERE.md` and `OPEN_ITEMS.md` name `.claude/`, which nothing in this
  repository did before.

### 2026-08-07 — `purchase_bills.created_by`, migration 0006 (server + proof)

**NO DEVICE.** Everything below is a migration, an HTTP proof or a catalogue
read on this box. No screen was opened; the 12:08 device pass above is not
refreshed by any of it.

**The column.** `created_by uuid`, NULLABLE, no default, plus
`fk_bills_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES users
(tenant_id, id)` and a `COMMENT ON COLUMN` — the first `COMMENT ON` in this
repository, a deliberate new convention. Read back out of the CATALOGUE, not the
file: `information_schema` gives `created_by | uuid | YES |` with no default,
identical in shape to `voided_by`; `pg_constraint` gives the FK definition
byte-for-byte the same shape as `fk_bills_voided_by`. The comment is ASCII by
design so it never needs hex to be trusted on a codepage-874 box, and that was
MEASURED rather than intended: `length 382 = octet_length 382`, no
non-printables.

**The inverse was EXECUTED, not asserted.** `alembic downgrade 0005` → exit 0,
then read back `column_rows 0, fk_rows 0, alembic_version 0005`. Then `upgrade
head` → exit 0, read back `column_rows 1, fk_rows 1, comment_bytes 382,
alembic_version 0006`. Gone, then back byte-identical.

**The write, read out of Postgres rather than reasoned about.** After the proof
set ran: **79 authorless, 32 authored, 111 total.** `created_by` resolves to a
real username with `same_tenant = t` on every row. Cross-checked two ways that
agree: 32 authored rows in Postgres, 32 `POST /bills` 201s in the uvicorn log,
**0 five-hundreds and 0 `BILL_POISON_CANDIDATE` lines**. Both `admin` AND
`staff` appear — bill creation is `Depends(get_principal)`, not
`require_admin`, so this column records something `voided_by` structurally
never can.

**A pre-migration bill read through `GET /bills/{id}` returns
`"created_by": null` explicitly** rather than omitting the key: the authorless
case is now stated by the API instead of being invisible.

**The proof, and the two mutations that make its green mean something.**
`prove_bills.py` CASE 1 asserts `created_by` against `GET /whoami` — both sides
DERIVED, from two different requests, never a literal from `seeddata` (the
2026-08-03 rebuild gave every seeded user a new id). CASE 7 does the staff half
and needs a second login. Green twice bare, no reseed.

| mutation | exit | cells fired |
|---|---|---|
| column, placeholder and `"cb"` param removed from the INSERT | **1** | `case1: … (bill says None, whoami says 35d09981-…)`; `case7: … (bill says None)` |
| seeded staff id hardcoded in place of `principal.user_id` | **1** | `case1: … (bill says bef92d61-…, whoami says 35d09981-…)` — **one cell only** |

**The second mutation is the one that carries the information.** A non-null,
valid, same-tenant, REAL user id was written and case 1 still went red, so the
assertion is not a disguised `is not None`. Case 7 stayed GREEN under it — the
hardcoded id IS the staff user, so that bill's author was accidentally correct.
One assertion can be fooled by a wrong constant; the pair cannot. Each mutation
required killing and restarting uvicorn (no `--reload`); `bill says None` is
what proves the restart took rather than a stale process answering. Reverted and
proven byte-exact by TWO hashes — `git hash-object`
`0d9ee40855924bae70a3f422790267484cd3fa11` and sha256 `30c0b6f1…0006d596`.

**WHAT THE MUTATIONS COST, and it is not zero.** They wrote **TEN permanent
rows the correct product could not have produced** — run `e903453d` five
authorless, run `e63a1c76` five naming the wrong user. They came through the
REAL path, so they are schema-valid, pass every `reconcile.py` check, and are
indistinguishable by inspection from genuine staff-created bills. Hard rule 5
means none can be removed. Written up as
`lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md`;
recorded as debris in `OPEN_ITEMS.md`.

**A PROOF THAT PERTURBS A SEQUENCE HAS BROKEN THE TEST, NOT FOUND A BUG.** The
staff assertion was first written into CASE 1 and turned `case4` RED: cases 4
and 5 assert doc_no ADJACENCY against case 1's bill (`seq_of(doc1) + 1`, then
`prev_max + 1/+2`), so a bill minted between them breaks assertions about the
counter that have nothing to do with authorship. Case 4 was NOT relaxed; the
staff creation moved to CASE 7, at the end, and the reason is recorded at the
site. Measured, not predicted.

**`prove_reconcile.py` — exit 1, 113 `[OK]` / 4 `[FAIL]`, and the four are the
four already recorded.** Verbatim: `S3/T0 … wrong or absent: {'T0': 91}`,
`S3/T0 … rows_visible_with_no_tenant_context=46`, `X3 … got {}`, `X3 … names
the table and both counts`. Every money injection passed across 19 injections.
Nothing in this work touched it. **[19 CORRECTED 2026-08-07 in P1.10; this
sentence read 23 when written. Measured three ways — the run header prints
`injections (19)` from `len(injections)`, 19 constructors stand in `build()`, and
the only commit that has ever touched the file holds 19. NO REASON FOR THE 23 IS
RECORDED: a reconstruction that fits arithmetically is not a recovered reason.]**

**A LINE-ENDING FINDING, AND THE MECHANISM IS UNDETERMINED — no cause is named
here because none was measured.** After editing, `server/scripts/prove_bills.py`
was CRLF in the WORKING TREE (`CR=316 LF=316`) while its blob at HEAD was LF
(`CR=0 LF=249`). Six untouched files were sampled and are all `CR=0`, so it is
not a repository pattern; `server/app/bills.py` is `CR=0` after six edits by the
same editor, so the editor is not uniformly the cause. **`git status` is
structurally BLIND to this** — `.gitattributes`' `text=auto eol=lf` normalises
on comparison, so a CRLF working copy compares EQUAL to an LF blob and nothing
is reported. `git diff` showed 69/2 lines rather than 316, i.e. a commit would
have produced a correct LF blob regardless. The working copy was rewritten to LF
and the diff re-checked byte-identical.

**AND A `CLAUDE.md` FOOTGUN IS CONTRADICTED BY MEASUREMENT — see the note under
Known stale references.** Not corrected here; `CLAUDE.md` was out of scope.

**WHAT THIS DOES NOT ESTABLISH.**

- **Nothing ran on a handset.** No screen was drawn. Whether the mobile client
  behaves any differently is untested and expected to be nil — its
  `BillResponseBody` declares two optional fields and reads only `doc_no`, so a
  new key is inert, which was CONFIRMED by reading the file rather than assumed.
- **No client displays an author anywhere.** `GET /bills` (list), the daily
  report and `reconcile.py` are all untouched and read nothing. The column is
  written and readable through `GET /bills/{id}`; it is on no screen.
- **The distinction the column names is unmeasurable today.** Mobile has ONE
  account (`app/config.ts` DEMO credentials; `App.tsx` has no `TextInput` —
  grep, 0 occurrences), so weigher and syncer are the same principal by
  construction until real per-shop accounts exist.
- **One process on this box was running pre-edit code throughout** — a uvicorn
  on port 8000, three hours old, never restarted. Every proof above was pointed
  explicitly at 8099 and 8099 was established as the current tree BY A RESPONSE
  (`created_by` present in a `GET /bills/{id}` body) rather than by a process
  list. 8000 against the migrated schema writes bills with a NULL author.

### 2026-08-07 — P1.4, `users.is_active`, migration 0007 (server + proof)

**NO DEVICE.** Everything below is a migration, an HTTP proof, a catalogue read
or a hash on this box. No screen was opened and no button pressed; the 12:08
device pass above is not refreshed by any of it.

**The column, read out of the CATALOGUE rather than off the file.**
`information_schema.columns` gives `is_active | boolean | NO | true` — name,
type, is_nullable, default. The `COMMENT ON COLUMN` is the second use of 0006's
convention and is ASCII by design, which was MEASURED rather than intended:
`length 485 = octet_length 485`, so it never needs hex to be trusted on a
codepage-874 box.

**THE INVERSE WAS EXECUTED, NOT ASSERTED**, and the column state was read back at
each of the three points:

| step | exit | column_rows | comment_octets | alembic_version |
|---|---|---|---|---|
| `alembic upgrade head` | 0 | 1 | 485 | 0007 |
| `alembic downgrade 0006` | 0 | **0** | **0** | 0006 |
| `alembic upgrade head` | 0 | 1 | 485 | 0007 |

Gone, then back byte-identical. The comment died with the column, which is what
`downgrade()` claims and why it has no second statement.

**ALL FOUR SEEDED USERS READ BACK `is_active = t`, and zero accounts are
locked.** That is 0004's "the migration cannot change the meaning of any current
data" observed rather than argued — every existing row was already a live
account, so `true` restates a fact instead of guessing one.

**The proof: `prove_revocation.py` CASE 7 and CASE 8, 25 new cells.** Green
TWICE bare with no reseed, **57 `[OK]` / 0 `[FAIL]`** each run, and green twice
again after the mutations were reverted. CASE 3 and CASE 7 are each other's
negation — "a bump does not lock the user out" and "a lock refuses login
entirely" — which is why they are in one file: split across two, no run would
ever hold both.

**Two assertions sharper than the brief asked for, recorded because the reason
generalises.** The locked refusal is asserted INDISTINGUISHABLE from a wrong
password with both sides read off real responses and neither a literal
(`lessons/a-differential-control-is-only-as-good-as-its-weaker-side.md`). And
the peer control is tenant B's `staff` — the SAME username as the locked
account, since usernames are unique only per tenant — which is the one control
that would catch a lock applied by username instead of by id.

**BOTH MUTATIONS, RUN AGAINST A SCRATCH DATABASE, NEVER DEV.** A fresh post-0007
backup was restored into `recycle_lock_scratch` and a marker seller inserted
into it; the marker was then confirmed PRESENT in scratch (1 row) and ABSENT in
dev (0 rows), so "which database is this server on" is answerable from a
response. uvicorn ran on 8098 against the copy, and the dev server was killed
first so exactly one server existed and reaching the wrong one was impossible.
The reason for all of this is
`lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md`: with
either guard removed, CASE 7's `POST /bills` under a locked account SUCCEEDS and
writes a bill the correct product could not have produced, which hard rule 5
makes permanent.

Which code was answering was established BY A RESPONSE at every step, never from
a process list:

| probe | baseline | mutation A | mutation B | after revert |
|---|---|---|---|---|
| database | SCRATCH | SCRATCH | SCRATCH | DEV |
| locked login | 401, no token | **200, token** | 401, no token | 401, no token |
| locked `whoami` | 401 `account_inactive` | 401 `account_inactive` | **401 `token_revoked`** | 401 `account_inactive` |

**MUTATION A** — the `is_active` check removed from `main.py`'s login. Exit 1,
**three cells**, and they are the three CASE 9 predicts: the locked account is
refused at login with the correct password; the refused body carries no
`access_token`; the refusal is indistinguishable from a wrong password. **GREEN:
every token-side cell** — the pre-lock token still refused, the money path still
refused, CASE 8 still restoring. That split is the information: it says the lock
is missing from LOGIN and present in `get_principal`.

**MUTATION B** — `_require_active_account(row["is_active"])` removed from
`get_principal`. Exit 1, **two cells, both of them reading `code`**:
`the refusal names the ACCOUNT (account_inactive), not the token`, on `/whoami`
and on `POST /bills`. **GREEN, and sitting immediately beside them:**
`the token held before the lock is refused` and
`a locked account cannot reach the money path` — the two STATUS cells. The
request is still 401; it falls through to the version check and comes back
`token_revoked`. **A status-only proof would have been 57 of 57 with the guard
deleted.** This is the phase's finding, and it is a measurement.

**Both reverts proven by TWO independent hashes each**, and re-confirmed at the
end of the phase: `main.py` `git hash-object 7d531e96…` / sha256 `e616fbd5…`;
`auth.py` `git hash-object 12f62014…` / sha256 `ec30b1fb…`. Each mutation
required killing and restarting uvicorn (no `--reload`).

**The proof set, each run bare, one command per invocation.** Twelve at exit 0:
`prove_auth`, `prove_revocation`, `prove_bills`, `prove_rls`, `prove_master`,
`prove_master_write`, `prove_master_data_gate`, `prove_seller_pricing`,
`prove_shop_time`, `prove_daily_report`, `prove_backup_restore`,
`prove_docno_clock`. `prove_reconcile` exit 1, **113 `[OK]` / 4 `[FAIL]`**, the
four already recorded, unchanged by this work; every money injection passed.
`reconcile.py` names `users` only by table and by its two constraint names, so a
new column disturbs nothing there. Both mobile TypeScript programs exit 0 bare,
which for a server-only change is a regression check and evidence about nothing
else.

**ONE RUN WAS DISCARDED RATHER THAN COUNTED.** The first `prove_auth` went
through `| tail -6`, so `tail` owned the exit code — `CLAUDE.md`'s pipe footgun
exactly. Everything above was re-run bare with redirection, which is not a pipe.
A second counting trap bit in the same session: `grep -c` over a proof's output
stopped at "Binary file matches" because the 403/404 bodies carry Thai, so every
cell count here was re-taken with `grep -a`.

**WHAT THIS DOES NOT ESTABLISH.**

- **Nothing ran on a handset.** No screen was drawn. Whether a locked account
  looks like anything sensible on a phone is untested.
- **The mobile sign-in loop is DERIVED, not observed.** A locked account's phone
  will invite the operator to sign in and the sign-in cannot work; that is read
  out of the client's 401 handling against the server change, and **no device
  pass has been run against a locked account.** Recorded in `OPEN_ITEMS.md`
  against P3.7, which owns the screen and the decision about what a phone may
  honestly be told.
- **`P1.4`'s stated predecessor P1.3 is not done.** `ROADMAP.md` makes P1.4
  depend on it because an account is created and locked inside a tenant. The
  capability was built and proven against the uuid-carrying login; what it
  cannot yet do is be exercised by a human typing a shop code. Skipped
  knowingly, not overlooked.
- **No account has ever been locked by a person.** Every lock in this record was
  performed by a proof script or a probe.
- **`recycle_lock_scratch` and one more dump directory now exist.** Neither was
  removed, because `OPEN_ITEMS.md` records that no retention rule exists and
  that inventing one in passing is how a convention gets set by accident.

### 2026-08-09 — the 0009 key-space defect, measured on a surviving fixture

**NO FIX IS INCLUDED AND THE DEFECT REMAINS OPEN.** `backup_db.py` and
`restore_db.py` are byte-identical to what they were before this work.
`reconcile.py` was not opened and no predicate was widened. What changed is that a
defect previously established by READING two files has now been reproduced, its
trigger measured, and one of its recorded inferences resolved against us.

**WHAT WAS BUILT, AND SURVIVES.** A throwaway database
`recycle_tw20260809_0009fixture`, restored from
`recycle_20260809T045731Z_pre-directory-role` (the only dump at 0008, verified out
of the artefact at `COPY public.alembic_version` and not off the directory name)
and then walked up the REAL upgrade path with `alembic upgrade head` rather than
migrated from 0001. It carries its own provenance as a database comment, readable
with `shobj_description`:

    created 2026-08-09; source dump directory
    recycle_20260809T045731Z_pre-directory-role; DROP WHEN: the backup/restore
    schema symmetry is green AND a dump taken at 0009 exists in the backup root.

Three dump directories under `E:\recycle-online-backups\`, and **that DROP WHEN
condition governs all four artefacts** — they are the fixture the next two phases
need, and nothing here may be deleted before it is met:

| directory | state |
| --- | --- |
| `recycle_tw20260809_0009fixture_20260809T120530Z_tw0009fixture-at-0008` | at 0008, the negative control |
| `recycle_tw20260809_0009fixture_20260809T120912Z_tw0009fixture-at-0009-empty` | at 0009, `directory.shop_codes` empty |
| `recycle_tw20260809_0009fixture_20260809T121049Z_tw0009fixture-at-0009-onerow` | at 0009, one code issued |

Each label states the migration version because nothing else in the artefact does
— `MANIFEST.json` records the source database and the instant and NOT the schema
version, which is the gap the backup-label entry in `OPEN_ITEMS.md` already names.

**WHAT WAS PROVEN, WITH THE NUMBERS.** The counting instrument was controlled
first: `grep -c "^COPY "` against a hand-built six-line file whose correct answer
is 3 returned 3 — not 4, so the pattern is anchored to line start; not fewer, so
blank lines are not being dropped, which is the `Measure-Object -Line` footgun.

- At 0008: **12** `COPY` headers in the dump against **12** user tables
  (`relkind` `'r'`; the `'p'` count is **0**, reported separately). They agree.
  No table in this fixture has zero rows, so this could not settle the
  empty-table question, and did not.
- At 0009 with the new table EMPTY: **13** headers. The header
  `COPY directory.shop_codes (tenant_id, code) FROM stdin;` is present with no
  rows between it and its terminator. The manifest records
  `"directory.shop_codes": 0`, unstripped. `restore_db.py` **exited 1**, printing
  `[FAIL] directory.shop_codes     dump=0  restored=None` with all twelve other
  tables `[OK]`, and `RESTORE FAILED: row counts differ from the dump for
  ['directory.shop_codes']`.
- At 0009 with one code issued (`TW9FXTR2`, constructed from `ck_shop_code` and
  avoiding `O`, `0`, `I`, `1`, `L`): the same red with `dump=1  restored=None`.
- **The restore it condemned was correct.** Read back afterwards, the target held
  schema `directory`, the table, and `alembic_version` 0009, with every public
  table's count equal to the dump's.
- **The second observable waits for the row and the first does not.** At 0009
  empty the summary read `844 rows` over an itemisation of 844 — in agreement. At
  0009 with one row it read `845 rows` over an itemisation of 844, `MANIFEST.txt`
  read `Rows      : 845 across 12 tables` in a list where `shop_codes` appears
  zero times, and `restore_db.py` echoed `rows in dump   : 845`.
- A FAILED `restore_db.py` prints **no** `RESTORE_EXIT` line at all: `fail()`
  calls `sys.exit(1)` before the print. Both reds above are exit 1 with the line
  absent, which is the `RESTORE_EXIT=none` that `prove_reconcile.py` reads.

**THE CONTROL THAT MAKES THE RED MEAN ANYTHING.** A backup of the SAME fixture at
0008 restored into the same default target with the SAME two scripts one migration
earlier: `RESTORE_EXIT=0`, twelve `[OK]` rows. Without that, a red at 0009 is
consistent with a bad fixture, a bad box or a bad pair of scripts, and establishes
nothing about the migration. A second control sits underneath the whole phase and
prevented a much worse outcome: `MIGRATION_DATABASE_URL` was pointed at a database
that does not exist and `alembic` was made to fail naming it, proving the override
reaches `env.py` before the real upgrade ran. `env.py` calls `load_dotenv()`, whose
`.env` names the LIVE database; had the override not won, `alembic upgrade head`
would have migrated `recycle`. Both databases read 0008 at that moment, so nothing
else could have distinguished the two outcomes.

**THE pg_ROLES GUARD — WHAT WAS ACTUALLY OBSERVED, AND WHAT WAS NOT.** What was
observed is that **NOTHING STOPPED THE MIGRATION**. `alembic_version` moved to
0009, `directory.shop_codes` is in `pg_class`, and both GRANTs resolved against a
real role — `nspacl` reads `recycle_directory=U/recycle_owner` and `relacl` reads
`recycle_directory=r/recycle_owner`. The guard is the first statement in
`upgrade()` and raises before anything is written, and `env.py` wraps the run in
one transaction, so those effects existing means the guard cannot have raised.

**That is an inference from an absence, and it is not the same thing as watching
the guard refuse.** A guard that had been deleted outright would have produced the
identical observation. **The refusal path of 0009 has never been seen by any
session of ours.** It is recorded in this file as observed on a throwaway cluster
that was then destroyed, it was not re-run here, and re-running it was explicitly
not this phase's job. Do not let "the guard was satisfied" stand alone anywhere: it
means "nothing raised", which is weaker, and the weaker statement is the true one.

**CORRECTIONS TO THIS FILE THAT THIS WORK FORCES.**

- **"0009 has never been applied to a cluster that survived" is now FALSE**, and
  it is the entry immediately above this one. It has been applied to
  `recycle_tw20260809_0009fixture` on the DEV cluster, which survives on purpose
  under the DROP WHEN condition quoted above. The dev cluster's own
  `recycle` database was NOT migrated and still reads 0008 with a `directory`
  schema count of 0, re-read at the end of the phase alongside its 385 purchase
  bills.
- The `prove_reconcile` bullet under what is built claimed the script restores a
  copy on every run. Corrected in place, with the flag that makes it conditional
  named.

**WHAT THIS DOES NOT ESTABLISH.**

- **No fix, and none is designed here.** `copy_block_counts` and the restore-side
  count query still disagree about schema qualification.
- **No proof suite was run.** Not `prove_reconcile.py`, not
  `prove_backup_restore.py`, neither of which this phase touched or measured.
- **Nothing was run on a handset**, and no device gap in this file is refreshed.
- **The directory lookup still does not exist as a code path.** The fixture has a
  row in `directory.shop_codes` because one was inserted by hand to move the
  second observable; no endpoint resolves a code and no client sends one.

### 2026-08-10 — the pilot shop provisioned, and the one layer of five that mangles

**`provision_shop.py` run against `recycle` for the first time**, with
`--yes-this-is-the-live-database`, which is the mechanism the script itself
defines: it compares `--database` against the database named in
`APP_DATABASE_URL` — read from configuration, not hardcoded, so the guard cannot
quietly stop guarding if a deployment renames the database — and requires that
explicit long flag. The admin password came from `PROVISION_ADMIN_PASSWORD` in
the environment and appears in no output and on no command line.

**THE ORDER WAS THE POINT.** A backup was taken and PROVEN RESTORABLE before
anything was written, and the command-line hop was measured before the write
rather than after. These rows cannot be deleted and a shop code cannot be
reissued, so a mangled name would have been permanent. That rule is now in
`CLAUDE.md § Workflow`.

**WHAT LANDED.** Tenant `982d76af-dd35-4c46-a54c-f087c39b92c8`, name 62 bytes /
22 codepoints, `created_at 2026-08-10 09:32:06.883251+00`; user
`35770909-1393-4b8c-b3e9-0feeb6c9ae50`, username `admin`, role `admin`,
`is_active t`, `token_version 1`, password hash prefixed `$argon2id`; code
**`R6VD7RAC`**. Resolved as `recycle_directory`: `R6VD7RAC` ->
`982d76af-…-f087c39b92c8`, which is the shape `POST /auth/shop-code` consumes.
Counts moved 2/4/0 -> 4/6/2 — **two each, not one**, both increments accounted:
the owner's shop and the ASCII control tenant the comparison required.

**THE FIVE LAYERS, HEX AGAINST AN EXPECTED VALUE FIXED ONCE.** Expected was
established from a file written by the editor, never crossing a shell:
`e0b89ae0b8b2…e0b8a5`, 62 bytes.

| layer | Thai | ASCII control |
|---|---|---|
| argv into the script | match | match |
| written to and read back from `recycle` | match, 22 chars / 62 bytes | match |
| **stdout as the script printed it** | **MISMATCH — `bad2a7a1cda1…`, 22 bytes** | **match** |
| the `COPY` block in the dump file | match | match |
| the same row after a restore | match | match |

Layers one, two, four and five were compared by paths a console cannot touch:
`encode(convert_to(name,'UTF8'),'hex')` computed server-side, and the dump read
in BINARY and never decoded.

**THE FIRST AND ONLY LAYER TO DIFFER IS STDOUT, AND WHAT THE BYTES BECAME IS THE
USABLE PART.** Python reports `sys.stdout.encoding=cp874` and
`locale.getpreferredencoding(False)=cp874` on this box. It encoded the 22
characters as 22 single-byte CP874 codes — `บ`->`ba`, `า`->`d2`, `ก`->`a1`,
`์`->`ec`, `ี`->`d5`, `ิ`->`d4`. **CP874 represents every character in that name,
so NOTHING IS LOST**: no error, no `?????`, no mojibake, and it renders correctly
wherever anyone looks at it. It breaks only when something downstream decodes
that stream as UTF-8. **The layer that mangles is the only layer a person checks
by eye, and the four that matter are ones nobody sees.**

**THE CONTROL IS WHAT MAKES THAT READABLE.** An ASCII-only name went down the
identical path in the same round and matched at EVERY layer including stdout, so
the Thai mismatch there is a property of non-ASCII text rather than of a broken
comparison. **Two bounds.** The stdout figure is a PROXY — the same interpreter
writing the same string to a redirected stream, not the captured bytes of the
original run, which cannot be recovered from where the reader sits. And the name
carries above-line vowels (U+0E34, U+0E35) and a thanthakhat (U+0E4C) but **no
below-line vowel**, so that class was not exercised.

**THE FIXTURES, PROVEN UNCHANGED ARTEFACT AGAINST ARTEFACT.** The
`COPY public.tenants` rows for Shop A and Shop B are byte-identical in
`recycle_20260810T090615Z_at-0009-pre-provisioning` and
`recycle_20260810T093442Z_at-0009-post-provisioning`, `created_at` of
`2026-08-02` included. Not a re-read weighed against a memory.

**THE SECOND RUN REFUSED**, naming the one-code-per-shop rule and saying nothing
was written; **counted either side rather than believed**: 4/6/2 before, 4/6/2
after.

**BACKUPS, BOTH KEPT.** `…090615Z_at-0009-pre-provisioning`, its version read as
`0009` from the dump body at `recycle.sql:331` rather than off its label, and
restored green before any write. `…093442Z_at-0009-post-provisioning`, 850 rows,
restored into the default scratch target for layer five.

**WHAT THIS DOES NOT ESTABLISH.**

- **`recycle` IS THE DEV DATABASE AND STAYS DEV.** Production does not exist and
  will be created fresh when hosting is chosen, so this shop, this admin and
  `R6VD7RAC` are discarded with this database. **Nobody should print a slip from
  that code.** Recorded as D5 in `ARCHITECTURE.md § 10. The three settled decisions`.
- **THE FIRST STEP TOWARD A PAYING SHOP IS NOT CLOSED BY THIS RUN.** It is a test
  of the script under the most realistic conditions available today. P1.3's
  Criterion B is still outstanding, because a real shop is one on production.
- **P1.5 IS NOT SATISFIED**, and as of `cb11f6a` that sentence means ONE thing
  where it used to mean two. **~~there is no endpoint by which an admin could
  create one — 29 declared paths, none of them a create-user or password-change
  route~~ — FALSE FROM `cb11f6a`**: 31 paths, and all three routes exist. What is
  outstanding is not an endpoint. It is that **nothing has signed in from a
  handset and the production database does not exist** — P1.7 and P1.11 for the
  phone, P1.2 for the server — rather than anything unwritten. The DONE WHEN is
  untouched and still wants a first admin AND a staff account, both signing in
  from a handset.
  **CORRECTED 2026-08-12 — "nothing has signed in from a handset" is no longer
  true as written, and the bar does not move.** A sign-in and a sign-out have
  since happened on a handset: the login screen drawn, a session established and
  cleared. **The artefact is a TEST artefact** — this project's own Android DEBUG
  build (`9d2eb22`, `dev.chutipon.recycle`), one vivo 1938, never Expo Go, its
  API address a plain-HTTP LAN address baked in at build time, reaching only this
  network's dev server. **What did NOT happen:** nobody signed in through that
  screen to reach the cart screen and nothing was weighed; iOS ran the secure
  store's clear on 2026-08-06 and has never run the migration; and no release
  build exists on either platform. The production database still does not exist,
  so the DONE WHEN — a first admin AND a staff account, in production, both
  signing in from a handset — is untouched by this.
- **The user-writer survey's bound travels with it:** the endpoint negative comes
  from the published schema and is authoritative for endpoints, but the survey of
  which writers reach `tenants` was run over raw-SQL spellings, so it is three
  sites FOUND rather than three proven to be all.
