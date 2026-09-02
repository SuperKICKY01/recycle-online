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

**Superseded 2026-08-30 (`49f9fd2`): this "Last updated"
date PREDATES every entry beneath it — the maintenance blocks (M0–M6) and the
P1.8b records below it, and § Current phase, are all newer. Read § Current phase
for where the work stands; this header is kept only as the record of the R1/R2
closure it announces.**
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

**STAFF MANAGEMENT ON THE PHONE — SCREEN SUB-PHASE 2 OF 2: THE USER-MANAGEMENT SCREEN. 2026-09-02.** No sha yet
(this record precedes the commit; anchor next pass). Supersedes the server sub-phase record below AS THE POINTER ONLY
— that work stands and is committed (0a42b59). This closes the CLIENT half of the two-phase step; P3.7 is still NOT
closed (it may also home on the provider web — the owner's open call).
**WHAT A SHOP CAN DO TODAY THAT IT COULD NOT YESTERDAY, IN PLAIN TERMS.** The owner adds, deactivates, reactivates
and resets the password of his own staff FROM THE PHONE — no curl, no SQL, no call to us — and a removed employee's
phone stops working at its very next request. That is the first change in a week a person standing in a yard would
notice, and it is what lets a real shop be opened without the vendor doing the hiring and firing by hand.
**WHAT WAS BUILT (client only; no server change, no migration, no new dependency).** `mobile/src/users/usersAdmin.ts`
(pure builders: readUsers, the roster model incl. the last-admin client guard, checkNewUser/checkPassword, the refusal
and read-message classifiers, all the Thai sentences); `mobile/app/UsersScreen.tsx` (the roster grouped active/inactive
under muted headings, the signed-in row marked, an inline add-user form) and `mobile/app/UserActionsSheet.tsx` (the ⋯
grab-handle sheet mirroring TierActionsSheet — reset password, deactivate with a confirmation, reactivate); the five
`api.ts` transports (fetch/create/deactivate/activate/reset); `mayManageUsers` + `readTokenUserId` in deviceRole; two
new sheet kinds (`users`, `user_actions`) + transitions; and an ADMIN-ONLY row in SettingsScreen that opens it (staff
never see it). Reached from ตั้งค่าร้าน the way the tier list is.
**DESIGN DECISIONS (approved by the owner at the S0 stop).** (1) The admin TYPES the first password (D8 — no reveal
UI to build, no clipboard/secret-store exists; the buffer dies with the sheet and is cleared on submit, nothing logs
it). (2) The signed-in row offers NO destructive action and points at the account screen's change-own-password. (3)
Refusals are worded from the cause on status+code (never the server prose), asserted negatively over the whole render
with a presence sibling. (4) The last-active-admin refusal is the SERVER's authority (409 `last_active_admin`, shipped
in sub-phase 1); the phone's "don't offer deactivate on the last active admin" is a SECOND layer, and a note says what
the absence protects.
**READINGS (each command bare; cp874 box).** Both typechecks GREEN before and after (`npm run typecheck` and
`typecheck:app`, exit 0 each). `prove:users` (new) GREEN TWICE (exit 0/0, 60 cells): headless H1–H5 (the admin-only
entry gate with an admin presence sibling; the roster incl. a deactivated user and the last-admin guard; every refusal
sentence with no diagnostic leak and a presence sibling; the first-password note shown once, no console in either
screen, the buffer cleared, the password carried in exactly one body field; the deactivate/reset confirmations naming
the sign-out) PLUS a real-HTTP round against a fresh uvicorn on a scratch — create, deactivate, `R2c` THE DEACTIVATED
USER'S EXISTING TOKEN IS REFUSED 401, reactivate, reset (old password stops, new works). `prove:users -- --offline`
exits 2 (never 0) — the headless-only run is marked incomplete, so a green without a server reads for what it is.
`prove:sheets` GREEN — the reachable set moved by EXACTLY the two stacks added (`settings>users`,
`settings>users>user_actions`); the max-depth expectation was edited 2→3 for the one three-deep drill-down and NAMED.
`prove:tapaudit` ZERO across 29 files (the two new screens use theme tokens only). Regression spot-checks green:
`prove:theme`, `prove:settings`. The remaining behavioural proofs cover modules this phase did not change; both
typechecks confirm the tree compiles. Citation floor re-derived at the boundary, BROKEN unchanged at 6.
**NOT OBSERVED ON A HANDSET.** Like every screen since phase E, no human has run this on a device; the readings above
are headless + a real-HTTP round through the app's own request SHAPE (app/api.ts itself cannot be imported by the
node proof — it reaches expo-constants — so the shape is reconstructed with the same withClientVersion wrapper). The
handset pass is owed, and `prove:users`' live round is the closest evidence short of it.
**LESSON OWED? NO.** The design decisions are recorded here and in the code's own comments; no real mistake landed in
the screen half that a future session would relearn (the one build error — an exactOptionalPropertyTypes `undefined`
on an optional prop — was caught by the typecheck and is ordinary strict-mode discipline, not a footgun). The machine
footgun list is unchanged.

**STAFF MANAGEMENT ON THE PHONE — SERVER SUB-PHASE 1 OF 2: THE LAST-ACTIVE-ADMIN GUARD. 2026-09-02.** No sha yet
(this record precedes the commit; anchor next pass). Supersedes the safety-net record below AS THE POINTER ONLY — that
work stands. This is the SERVER half of a two-phase step (the brief allowed "two phases if the server half needs
anything"); the SCREEN half is NOT built and P3.7 is NOT closed by this.
**THE HOMING DECISION (advisor's, the owner may veto), recorded as the advisor's:** user management ships on the
PHONE. P3.7 homes it on the provider web, which does not exist, and the desktop back office does not exist either;
waiting for either means no shop can be opened. Precedent set twice (shop settings P1.23, grade-tier management
P1.24). The collision — whether user management ALSO lives on the provider web later — is the owner's, filed under
OPEN_ITEMS.md Decisions open. This phase does not close P3.7.
**WHAT WAS BUILT (server only).** `POST /users/{id}/deactivate` now refuses deactivating the last active admin with
409 `last_active_admin` (detail carries `active_admins`), guarded by a `SELECT … FOR NO KEY UPDATE` lock over the
active-admin set in the same transaction as the write. `server/app/users.py` only; no migration, no other route, no
client. The Thai message mirrors `grade_tier_last_active`'s shape; the screen half will render its own sentence keyed
on the code.
**THE GUARD REVERSES A DECISION THE CODE CLAIMED THE OWNER HAD MADE, AND THAT CLAIM WAS DANGLING.** `users.py`'s
module docstring and its self-deactivation site both said the last-admin gap was "Recorded in OPEN_ITEMS.md as the
owner's decision, with the cost stated." No such entry existed (searched tracked `*.md` and `archive/` for six
distinct phrasings; only unrelated hits). A comment asserting a recorded decision that points at nothing borrows
authority it never had and protected this footgun for months — the same defect class as a citation to a heading that
does not exist. Both the reversal (owner's decision of 2026-09-02) and the dangling pointer are recorded under
OPEN_ITEMS.md Decisions open, and the two stale comments are superseded in place.
**THE ADVISOR'S INSTRUCTION WAS WRONG, CORRECTED HERE ON THE OWNER'S DIRECTION.** The brief said to mirror
`grade_tier_last_active` EXACTLY. That would have shipped FALSE ASSURANCE, for two measured reasons. FINDING 1: no
serial deactivate can reach zero active admins — the caller passed `require_admin` so is an active admin this request,
and a deactivate either targets the caller (`cannot_deactivate_self` refuses first) or someone else (the caller stays
active). So `cannot_deactivate_self` was ALREADY the whole serial guarantee, and the ruling's stated fear (a serial
permanent lockout) was not reachable. FINDING 2: grade tiers have no self-check before their guard, so a plain
`SELECT count(*)` is serially reachable there; the admin path has the self-check in front, so a plain-count mirror
would be UNREACHABLE serially (the seventh mechanism in
`lessons/a-check-that-never-went-red-was-never-observed.md`) and INEFFECTIVE concurrently (READ COMMITTED lets both
racers read count=2 before either commits). The ONLY zero-admins path is a concurrent mutual-deactivation race, and
only a lock closes it. The owner ruled to build the airtight lock on the risk asymmetry: an over-refusal is
recoverable, a zero-admin shop is not.
**READINGS (each command BARE, exit read in the same invocation; cp874 box).** `prove_user_admin.py` (new) GREEN
TWICE, EXIT 0/0 — 15 cells: the serial success (2 admins → deactivate one → 200, one remains), the self-check still
first and still `cannot_deactivate_self` NOT `last_active_admin` when the sole admin self-deactivates, reactivation
restoring the pair, a staff deactivation ungated, and the concurrency cell — an EXTERNAL transaction holds the lock as
a deterministic barrier, the real HTTP deactivate is OBSERVED blocked on a NOT-granted lock (waiting, not slow), the
winner commits, and the loser is refused `409 last_active_admin` with exactly one active admin left. DISPROOF (named
first, run by hand): dropping ` FOR NO KEY UPDATE` from the guard reddens EXACTLY C2 (the loser gets 200, not 409) and
C3 (active admins = 0) — the shop is locked out — while C1 (blocked) stays green; that red is the only direct evidence
the lock does anything, since no serial path reaches the guard. It is deterministic because the interleaving is
imposed by the external transaction's commit point, not raced. NEIGHBOURS UNCHANGED: `prove_user_create.py --database
recycle_users_scratch` GREEN TWICE (133 OK, 0 FAIL each), and its P8 ran `prove_revocation.py` GREEN both times (70
OK, 0 FAIL) — create, both password routes, and the deactivate/activate/revocation cases all pass unchanged, so the
shared-handler edit caused no regression.
**GATES.** verify_shared_checks.py EXIT 0 (4 items, no shared-checks block touched); verify_citations.ps1 over the
named 14 — BROKEN unchanged at the floor of 6 (the doc edits reference lessons and files by name in prose, not as
citation handles). No typecheck/TS run — nothing under mobile/ or desktop/ was touched.
**LESSON OWED? NO — the two findings are recorded as the DECISION's record (OPEN_ITEMS) and belong there, not as a
lesson; the guard's own body carries the concurrency reasoning. The machine footgun list is unchanged (no new
box).** The SCREEN sub-phase, when it runs, will re-assess whether IT owes one.

**THE LOCAL SAFETY NET — THE BACKUP HALF'S LOCAL, FREE AUTOMATION (P1.2). 2026-09-02.** No sha yet (this record
precedes the commit; anchor next pass). The current-phase pointer, superseding the version-contract records below AS
THE POINTER ONLY — that work stands. Owner's decision, verbatim, never translated: "ผมอยากทำทุกอย่าง local อยู่บนเครื่องผมก่อนครับ ผมยังไม่อยากจ่ายอะไรทั้งสิ้น" — local on his machine first, nothing paid yet. So this is the FREE half;
P1.2's DONE WHEN (an https URL the phone reaches, and a dump fetched off-box) is UNCHANGED and open.
**HAS A RESTORE EVER BEEN PERFORMED FROM A REAL BACKUP FILE ON THIS BOX? YES — repeatedly, before today.** The cluster
holds ~19 restored/scratch databases (recycle_restore_scratch/_source/_target, recycle_keyshape_scratch,
recycle_tw20260809_0009fixture, plus a dozen feature scratches); the keyshape and tw0009fixture scratches correspond
one-to-one to at-rest dump directories on E:, so real files were restored. The disaster rehearsal is recorded in
ROADMAP.md's P1.2 step and server/scripts/BACKUP.md. This phase did NOT create the safety net — it automated and
verified it.
**TWO SURVEY CORRECTIONS (owner-directed, recorded so the next reader does not repeat them).** (1) Backups were NOT
absent — sixteen real dumps (2026-07-28 to 08-30); the gap is narrower: nothing SCHEDULED them and every copy shared
a disk with the repo. (2) The database (C:, physical disk 3, the Docker/WSL2 vhdx) and the existing backups (E:, disk
1) were ALREADY on different physical disks, so a single disk death and `docker compose down -v` were already
survivable. What is NOT survivable is losing the MACHINE — so the phase's job was to make the backup run itself and
reach a drive that can physically leave the building.
**WHAT IS BUILT (all under server/scripts/, plus .gitignore).** safety_net_backup.py (daily job: wraps the proven
backup_db.py, adds a copy of server/.env and a SOURCE_REVISION.json recording the git commit + alembic revision the
schema matches, REFUSES any destination on the repo/.env disk or the database's Docker disk, prunes to 30 runs, fails
LOUDLY on unplugged/full/failed); verify_backup.py (weekly restore drill: restores the NEWEST dump into a scratch via
restore_db.py and adds alembic-revision, grants and byte-identical-known-row checks, then drops the scratch, and
distinguishes UNPLUGGED exit 3 from FAILING exit 1); check_backup_freshness.py (writes BACKUP_OVERDUE.md at the repo
root after 3 stale days, surfaced by `git status` and every session's opening snapshot); safety_net_common.py (the
shared exit-code/disk-detection/heartbeat plumbing); RECOVERY.md (the one-page disaster-recovery procedure). The
destination is a removable USB (D:, disk 4); it is CONFIGURATION (`--dest` or the scheduled task), never hardcoded;
retention is the named constant KEEP_RUNS=30; the scheduled task is OWNER-registered (command in RECOVERY.md), not
auto-registered.
**TWO ACCEPTED RISKS, STATED (recorded in OPEN_ITEMS.md).** (a) The copies live on the same physical MACHINE (the USB
stays in the building), so fire/theft/whole-machine loss still loses the DB — accepted until the owner pays for
off-site + HTTPS. (b) The destination holds live credentials in CLEARTEXT (globals.sql password hashes + a copy of
server/.env) — accepted only while the drive stays under the machine's physical control; the trigger to add
encryption is the drive leaving the building OR a real shop's data being in the dumps.
**PROVEN (each command BARE, exit read in the same invocation; cp874 box).** Job refusals: no --dest -> EXIT 2;
destination on E: (repo disk 1) -> EXIT 4, message naming the disk; an absent drive letter (unplugged) -> EXIT 3.
Passing case against D: -> EXIT 0 (dump of 1333 rows across 15 tables, server/.env copied, SOURCE_REVISION git
f14738c / alembic 0016, the overdue marker cleared). verify_backup.py against D: GREEN TWICE (EXIT 0/0 — restore +
row counts vs the manifest + RLS 13 ENABLE/13 FORCE/13 policies + restored alembic == recorded 0016 + 155 table
grants match live + witness bill immutable columns byte-identical, money as TEXT + Thai names byte-faithful to the
dump). Corruption DISPROOF: one byte flipped in a COPY of recycle.sql -> EXIT 1 at the named checksum cell (sha256
mismatch printed), good copy green again. check_backup_freshness.py EXIT 0 (fresh, no marker).
**LIVE READ, NOT WRITTEN.** reconcile.py on the live recycle database EXIT 0 (6 tenants swept, 112 checks, 0 skipped,
0 could-not-run, 0 violations) — this phase read the live DB and never wrote it; the drill writes only a scratch it
then drops.
**GATES.** reconcile.py EXIT 0; verify_shared_checks.py EXIT 0 (4 items); build_all_lessons.py --check EXIT 0
(unchanged — no lesson file touched); verify_citations.ps1 over the named 14 (call operator, `[string[]]`; SOURCES
read first): SOURCES=14 CITATIONS=613 BROKEN=6 — the floor is UNMOVED (the doc edits reference lessons and files by
name in prose, not as citation handles). git diff --stat: 4 tracked files modified (.gitignore, OPEN_ITEMS.md,
PROJECT_STATUS.md itself, ROADMAP.md) plus 5 new files under server/scripts/. No typecheck/TS relevant — nothing
under mobile/ or desktop/.
**LESSON OWED? NO — two real mistakes, both caught WITHIN the phase by disciplines already written down.** (1) The
disk resolver silently returned None (an f-string collapsed a PowerShell command's braces), which COLLAPSED the
same-disk refusal (exit 4) into "unavailable" (exit 3); caught because the proof asserted the SPECIFIC exit code per
refusal case, not merely "refused" — a-check-that-never-went-red-was-never-observed's rule to assert the
DISCRIMINATING field, not the shared outcome. (2) The failure handler wrote LAST_RUN_FAILED/STATUS to the
destination even on the unsafe-disk refusal — creating a directory on the very disk it had just refused; caught by
this phase's own cleanup verification (listing the disks AFTER the refusal runs), which is applied != verified /
measure-what-you-write. Both are the existing disciplines working exactly as written; nothing new was relearned.
Environment facts recorded (the volume is `server_recycle_pgdata`; the DB vhdx is on C:) are facts, not footguns.
**BOUNDS HELD.** No migration; no write to the live recycle database; no secret value printed or committed; nothing
under mobile/, desktop/, packages/, .claude/; the two owner artefacts (PRODUCT_BLUEPRINT.md, docs/SRS.md) untouched.
Device pass: N/A (no device surface). NOT COMMITTED — awaiting the owner's confirmation.

**THE VERSION CONTRACT — THE RED-TEAM REPAIR: THE UPDATE STATE REACHES ALL FOUR SURFACES, THE WEDGE IS CLOSED, AND
THE FLOOR CANNOT MASK A CORRECTIVE WRITE. 2026-09-02.** No sha yet (this record precedes the commit; anchor next
pass). The current-phase pointer, superseding the client-half pointer below AS THE POINTER ONLY — that half stands
(`21ae0a7`) and this closes the seven red-team findings recorded at `6ca9a3f`. The client-half record's own
"CORRECTION (RED-TEAM)" note — "the update state covers only the sync strip" — is now RESOLVED here. The floor
stays 0 throughout, and nothing in the repair raises it.
**THE ORDER IS THE REUSABLE PART.** When a red-team pass finds BOTH a green-under-mutation proof AND the defects
that proof should have caught, the proof is repaired first and its red is a published reading — because until that
cell can fail, nothing it measures is trustworthy, including the exception argued in the previous commit. Only then
were the surfaces fixed. That is why F6 came before F1-7 below.
**WHAT IS FIXED.** F6 FIRST, as the owner ruled (it is the instrument, not a feature): `prove:version`'s engine
cell used `noSellerKind()` and staged no void, so only `bill_send` ever produced `clientOutdated` — the deliberate
seller-counter exception had no cell. Added a void cell (a synced bill + a void, both stores) and a seller cell (a
one-seller store), so the runtime-no-op mutation (`+= 0`) on the void AND seller arms reddens THREE named cells
(C-void mem, C-void sqlite, C-seller) while `bill_send` stays green — the split is the reading, reported before any
other fix. F1-3 are ONE RULE — every surface that instructs an operator about a refusal reads the device-global
build fact — found by MAKING THE COMPILER ASK: a `client_outdated` member on `SignInResult`/`ShopCodeResult` (the
login/shop-code message switches went red until they said "update", not "แจ้งเจ้าของร้าน"), and a REQUIRED
`appOutdated` field on `SignOutCardInput` and the reserve-strip state (every construction site went red until it
passed the fact). The two typecheck programs enumerated EXACTLY four surfaces (strip already done; login/shop-code,
sign-out sheet, reserve strip); NO fourth appeared. F4-5 (the wedge): `appOutdated` is now DERIVED every pass by a
pure `outdatedAfterPass(was, r)` — a 426 sets it, a definitive non-426 answer clears it, no answer keeps it — not a
sticky latch; and because the 426's `halt_kind` blocks the re-probe, App retracts the halt before each pass while
the flag holds (`SyncEngine.retractOutdatedHalt`), so a floor lowered after a bad raise DRAINS the queue and clears
the flag. F7: the `(mtime,size)` cache is removed — `current_floor` reads the file's content every request, so a
corrective LOWER floor (same byte size) is honoured at once.
**THE CLEARING RULE, DECIDED AND DEFENDED (owner's question).** Evidence sufficient to conclude the build is
acceptable again: a FRESH non-426 answer this pass. It cannot be forged by a stale response because every counter
`outdatedAfterPass` reads (`r.synced`, `r.rejected`, …) is set only when the server returned that status on a
request THIS pass made — there is no client state that yields `r.synced > 0` without an actual accepted send
(transport security is out of scope today; even under tampering the safe direction holds — the app either sends or
is re-refused 426). Queued work survives BOTH directions: rows stay pending/owed and untouched under the 426 and
drain unchanged when the fact goes false; clearing the flag discards nothing. The re-probe rides the sync cadence
because a floor that cannot be lowered promptly is worse than none.
**PROVEN.** `prove:version` GREEN TWICE, now with the F1-3 surface cells (each with a current-build control), the
F4-5 recovery cell (a 426 sets the flag; a halted pass KEEPS it — the wedge; a lowered floor + retract DRAINS and
clears it with the bill surviving), and the F6 void/seller cells; the F6 mutation reading reported above. Server
`prove_version_gate.py` GREEN TWICE (16 cells; Phase D: a corrective lower floor, same byte size, honoured on the
next request). Regression GREEN TWICE: `proveSignOut`, `proveReserveStrip`, `proveOwedSurfaces`, `proveNotice`,
`proveSync`, `proveSeller`. Both mobile typechecks bare exit 0. NOT run: `proveLogin`/`proveLoginScreen` (real-HTTP,
need the dev server; the `SignInResult` change is typecheck-covered and its 426 arm is proven headless in
`prove:version` F1). `reconcile.py` NOT run — no migration/schema change (server change is the floor read; client
changes are TS). Device pass owed.
**LESSONS WRITTEN (deferred by the pass, owed on landing).** New:
`a-sticky-device-global-state-needs-a-clearing-rule` (F4-5), `a-cache-key-must-distinguish-the-values-it-caches`
(F7). Amendments: `correct-classification-can-still-render-as-an-error` (F1-3, one fact / four surfaces / the
compiler-enumeration), `a-check-that-never-went-red-was-never-observed` (F6, a rule-break with no cell because the
fixture never staged the kind). `build_all_lessons.py`: 64 files, 64 toc, 31 amendments, CHECK OK.
**GATES (each command BARE, exit read in the same invocation; cp874 box).** Both mobile typechecks exit 0.
`prove:version` and server `prove_version_gate.py` GREEN TWICE; six mobile regression proofs GREEN TWICE (above).
`verify_shared_checks.py` IDENTICAL (4 items), exit 0. `build_all_lessons.py --check` exit 0 (64 lessons, two new +
two amendments). `verify_citations.ps1` over the named 14 (call operator, `[string[]]`; SOURCES read first):
SOURCES=14, CITATIONS=613 UNCHANGED (the doc edits cite lessons by name in prose, not as `§` handles), BROKEN=6 —
floor unmoved. `git diff --stat` = 19 tracked files (683 insertions, 52 deletions) plus 3 new
(`mobile/src/sync/outdatedState.ts`, `lessons/a-sticky-device-global-state-needs-a-clearing-rule.md`,
`lessons/a-cache-key-must-distinguish-the-values-it-caches.md`).

**THE VERSION CONTRACT — THE CLIENT HALF: SEND THE HEADER, AND ONE CALM "UPDATE TO CONTINUE" SCREEN ON A 426.
2026-09-01.** No sha yet (this record precedes the commit; anchor next pass). The current-phase pointer, superseding
the version-contract SERVER-HALF pointer below AS THE POINTER ONLY — that half stands (`f911d9c`) and this completes
the handshake as its S6 second commit. The app now IDENTIFIES itself on every request AND reacts to a 426 as its
own class, so the floor can be raised without wedging the fleet: the "loaded gun" the server commit warned of is
disarmed on any handset carrying this build.
**WHAT IS BUILT — THE HEADER.** A headless module `mobile/src/net/clientVersion.ts` owns `CLIENT_API_VERSION = 1`
(the API-contract version this build speaks, NOT app.json's 1.0.0, carrying NOTHING that identifies a person or a
device) and `withClientVersion(fetchImpl)`, which stamps `x-client-api-version` on every request while preserving
the caller's own content-type/authorization. It is injected at the THREE transports the app had no chokepoint
across: the two sync adapters via their injected `fetchImpl` (`mobile/App.tsx`), and `mobile/app/api.ts`'s 15
read/write sites, now routed through one module-owned `apiFetch`.
**WHAT IS BUILT — THE 426 CLASS.** A SIXTH failure class `client_outdated` on `SendOutcome`, `VoidOutcome` and
`SellerCreateOutcome` — adding it made every exhaustive switch a compile error (the 401 lesson's mechanism, and how
the transports, classifiers, records and stores were all found). A 426 classifies to `halt_kind` (the kind stops
durably, like a 403: a 426 refuses every unit equally and no sign-in helps); the row returns to `pending` untouched
via `markClientOutdated`, a NAMED store transition byte-identical to `markSendForbidden` (poison cleared, no
schedule) on both the SQLite store and the in-memory fake; no poison clock starts; and a new
`SyncRunResult.clientOutdated` counter drives a device-global, STICKY `appOutdated` state in App — never cleared,
because only an app update (a new process) makes an old build new. `statusNotice` ranks it ABOVE the session (a 426
refuses the sign-in a dead session would offer) and renders ONE calm AMBER state with NO button (the update comes
from outside the app; where is P1.11's business, so none is invented) and NOT the sign-out path.
**KEY DECISIONS.** The header value is a single integer, not the marketing version. The 426 reuses `halt_kind`
(not a new disposition): a 426 is a 403 one axis along — refuses every unit, cleared only from outside the request.
The SEND row gets its own `markClientOutdated` rather than reusing `markSendForbidden`, so a row's history never
reads "forbidden" for a version refusal (the codebase's named-transition-per-class discipline). The seller kind
DOES set the `clientOutdated` counter — an exception to its no-`SyncRunResult`-counter rule, argued at the arm —
because a 426 is a DEVICE-GLOBAL build fact, so the "update" screen must show even on a seller-only device.
**NEW THAI (vocabulary settled 2026-08-31, extended), old→new.** Three strings, all in the existing
"แอปรุ่นนี้อ่านไม่ได้" / "…ยังอยู่ครบ" register: the head "แอปเวอร์ชันนี้เก่าเกินไป — ต้องอัปเดตก่อนใช้งานต่อ", and the two tails
" บิล N ใบยังอยู่ครบ จะส่งให้เองหลังอัปเดต" (adapted from the session tail's "…หลังเข้าสู่ระบบ") and " บิลที่บันทึกไว้ยังอยู่ครบ".
**PROVEN, headless.** `prove:version` (`mobile/src/proof/proveVersion.ts`): the header on every adapter request WITH
a control that reddens without the wrapper; 426→`client_outdated` beside a 401→`session_expired` sibling (the
transport seam); the engine on BOTH stores — a 426 halts, leaves the bill pending, sets `clientOutdated` NOT
`sessionExpired` (401 the presence sibling), starts no poison, reaches no server; THE OWNER'S CELL — a bill queued
BEFORE the 426 is present and SENDS after a fresh engine (the updated build) drains the same store; and the strip —
calm, amber, no button, outranks the session, and THREE DIFFERENT sentences for 426/401/offline (the
two-green-proofs seam in one run). GREEN TWICE. Regression, GREEN TWICE: `proveSync`, `proveNotice`,
`proveSignOut`, `proveOutbox`, `proveStatusCounts`, `proveOwedSurfaces`, `proveClock`, `proveSeller`. Both
typechecks bare exit 0. NOT run — the four real-HTTP proofs `proveForbidden`, `proveCold`, `proveLogin`,
`proveLoginScreen` need the running dev server; their only change is a non-behavioral `appOutdated: false` in a
`StatusInput` literal, typecheck-covered. Adding the header breaks no proof: those that build requests by hand omit
the wrapper, and the server floor is 0, which admits a header-less request.
**EDITS THIS COMMIT (all under `mobile/`).** New: `src/net/clientVersion.ts`, `src/proof/proveVersion.ts`. Changed:
`src/sync/{types,sellerCreate,outboxHandlers,engine,outboxRunner,statusNotice}.ts`, `src/adapters/httpTransport.ts`,
`src/adapters/httpSellerTransport.ts`, `src/adapters/sqlite/SqliteLocalStore.ts`, `src/proof/fakes.ts`, `App.tsx`,
`app/api.ts`, `package.json`, seven proofs for `appOutdated: false` (`proveClock`, `proveCold`, `proveForbidden`,
`proveNotice`, `proveOwedSurfaces`, `proveStatusCounts`, `proveSync`), and four docs (this record, `ROADMAP.md`
reconciliation (c)/(d) + P1.11, `OPEN_ITEMS.md`, `ARCHITECTURE.md` section 3). Nothing under `server/`, `desktop/`,
`packages/`, `tools/`, `.claude/`; no migration; the two owner artefacts untouched. Lesson owed? NO — the 401 lesson
already carries this shape (a caller-not-bill class: own member, device-global derived state, no poison, queued
work untouched, the seam test); nothing new was relearned.
**GATES.** Both mobile typechecks bare exit 0. `prove:version` + eight regression proofs GREEN TWICE (above).
`verify_shared_checks.py`, `build_all_lessons.py --check` and the 14-source citation floor are unaffected by
mobile code and are re-read at commit. Device pass owed (headless-proven; the handset run is P1.11's).
**CORRECTION (RED-TEAM 2026-09-01, `21ae0a7`).** "ONE calm … screen" above is TRUE of the sync STRIP and OVERSTATES
the rest: the "update to continue" state covers only that strip. A nemesis pass found the LOGIN/shop-code screen, the
SIGN-OUT sheet and the RESERVE-code strip still render wrong instructions on a 426 ("tell the shop owner", "wait for
a send", "connect to refill" — none says "update"), that `appOutdated` has no in-process clearer (a rolled-back
floor leaves a device wedged or contradicting its own synced rows), and that the seller/void `clientOutdated`
counter is unproven. All are LATENT while the floor is 0 and MUST be closed before it is ever raised. Recorded, NOT
repaired, at `OPEN_ITEMS.md`'s "THERE IS NO API VERSION" entry (the RED-TEAM block). No lesson yet — a red-team
finding produces a lesson when it is FIXED, and these are recorded for a follow-up, not fixed here.

**THE VERSION CONTRACT — SERVER-SIDE API VERSIONING AND A FORCED-UPGRADE GATE (SERVER HALF). 2026-09-01.** No sha
yet (this record precedes the commit; anchor next pass). The current-phase pointer, superseding the login-lockout
pointer below AS THE POINTER ONLY — that phase stands and this builds beside it. Blueprint 10.11/14.3 and the
STEP-4 no-dependency item "Server-side API versioning" reconciled at
`ROADMAP.md § The product blueprint, reconciled — 2026-09-01` (d): the contract that must exist BEFORE the first
installable build (P1.11), because a contract change against an un-updated handset fails SILENTLY — a bill that
saves but means something else. Closes the SERVER half of the OPEN_ITEMS "THERE IS NO API VERSION" gap.
**WHAT IS BUILT.** A global middleware `_refuse_outdated_client` (`server/app/main.py`) reads an integer
API-contract version off every request's `x-client-api-version` header and, when it is below a floor, refuses with
426 Upgrade Required — a status this API emits NOWHERE ELSE (the in-use set is
200/201/400/401/403/404/409/422/424/503), so a client branches on the STATUS alone, never the body. The judgement
lives in `server/app/version_gate.py`; the refusal body is the house `{"detail":{kind,code,message,...}}` envelope
with a distinct `kind="client_outdated"` and machine-readable integer floor/version fields, its English message for
logs only. It runs OUTERMOST (registered after the clock guard; Starlette wraps `reversed(user_middleware)` over an
insert(0) list), so a too-old client is told to UPDATE even while the clock guard is tripped. `/health` is the ONE
exempt path, by exact equality like the clock guard.
**KEY DECISIONS, each argued in the module.** The version is a single monotonic INTEGER — the API contract the
client was built against, NOT the marketing version (app.json's 1.0.0), carrying NOTHING that identifies a person
or a device. It rises by one only when the server changes a contract an old client would MISHANDLE (worked example
in `version_gate.py`: introducing 424 WOULD have raised it — an old client classifies an unknown 4xx as
retry-forever+poison; adding `user_id` to the login response or a whole new route WOULD NOT). The floor FAILS OPEN,
the OPPOSITE of JWT_SECRET: it is an availability value, not an identity one, so a floor that cannot be read must
ADMIT — default 0, absent/malformed header = version 0, and at floor 0 EVERY client is admitted. THE FLOOR IS DATA,
NOT A DEPLOY: its value lives in a FILE read PER REQUEST (mtime-cached), so raising it needs no code edit and no
restart; the file's PATH is import-time config, env-settable only for the proof (the `clock_guard.TICK_SECONDS`
shape). NO TABLE, so NO MIGRATION. Enforced as MIDDLEWARE, not a per-route dependency, so no route can forget it.
**THE FLOOR IS SET TO ACCEPT TODAY'S BUILD, AND RAISING IT IS A DELIBERATE ACT NOBODY HAS TAKEN.** With no floor
file present the floor is 0, which admits the header-less build on the owner's handset today and every future
version; the contract is VOLUNTARY until someone writes a higher number to the floor file. The gate is a proven
pass-through until then.
**THE FLOOR IS A LOADED GUN UNTIL THE CLIENT HALF SHIPS — leave it at 0.** Raising it above 0 does NOT refuse an
outdated fleet politely, it WEDGES it: today's app turns an unknown 4xx, 426 INCLUDED, into `unavailable` on the
bill path (`mobile/src/adapters/httpTransport.ts`), which retries forever, trips the poison alarm and blocks the
HEAD of the outbox queue. So a floor raised before the CLIENT half ships turns every un-updated handset into a
jammed, red-alarmed device that cannot send the bill in front of it. The client half is what unlocks raising the
floor (it adds the `client_outdated` class that reads a 426 as "update the app"); until it has shipped AND is on
the handsets being cut off, whoever raises the floor checks that first. The warning is repeated where the hand
reaches for it (`server/app/version_gate.py`, the comment above `current_floor`).
**THE FLOOR FILE'S OPERATIONAL FACTS, so an operator who cannot find it does not conclude the gate is broken.** The
value lives in `server/api_version_floor`, GITIGNORED like `.env`, so it does NOT travel with a deploy. On a fresh
box the file simply does not exist, and its ABSENCE is the normal, healthy state: no file means floor 0 means every
client admitted. An operator creates it, when and only when the fleet is ready, by writing a single integer to that
path (or to the path named by the `CLIENT_API_VERSION_FLOOR_FILE` env var); the next request reads it, no restart.
Deleting the file lowers the floor back to 0.
**PROVEN, headless.** `scripts/prove_version_gate.py` — 14 cells over real HTTP (its own child uvicorn on a free
port against a scratch, gated on `/openapi.json` first), GREEN TWICE with `--skip-restore` between. It writes the
floor file DURING the run, so "the floor rises without a restart" is one process changing its verdict (401 at
floor 0 → 426 at floor 1 → 401 again when the file is removed). Three disproofs, each reddening its NAMED cell
while the controls held (B5/B6 admitted-version and B7 /health stayed green under all three): (a) exempt /products
too → B1; (b) freeze the floor at import → B_FLIP; (c) return 401 not 426 → B_DISTINCT. REGRESSION: the middleware
is mathematically a no-op at floor 0 (too_old is client<0 and the parser clamps to ≥0), and no existing proof
sends the header or creates the floor file; verified through the new middleware by `prove_login_guard` (32 cells)
and `prove_grade_tiers`, each GREEN TWICE. THE OTHER 19 HTTP PROOFS WERE NOT RE-RUN, each NAMED with the reason (a
green not run today is not written as green): eight OTHER own-child proofs import this same `main.py` and hit the
same middleware at floor 0 — `prove_shop_code`, `prove_user_create`, `prove_seller_create`,
`prove_seller_code_reservations`, `prove_seller_code_guards`, `prove_shop_settings`, `prove_reports_summary`,
`prove_seller_history`; eight run against a SEPARATELY-started server (they do not import this code unless that
server is restarted onto it, and are no-ops at floor 0 either way) — `prove_auth`, `prove_bills`, `prove_master`,
`prove_master_data_gate`, `prove_master_write`, `prove_revocation`, `prove_seller_pricing`, `prove_daily_report`;
three HTTP+SQL against that same external server — `prove_shop_time`, `prove_clock_guard`, `prove_year_gate`. All
19 exercise the floor-0 pass-through identically to the two representatives run green twice. `reconcile.py` NOT
run — no schema/table change (the floor is a file).
**WHAT IS NOT BUILT — the CLIENT half, owed as its own commit (S6 split).** The app does not yet SEND
`x-client-api-version` nor react to a 426; today an unknown 4xx on the bill path is retry-forever+poison
(`mobile/src/adapters/httpTransport.ts`). The client half — send the header on all three transports and render ONE
calm device-global "update to continue, your work is safe" screen on a 426 (its own class, like the 401 session
class: no poison, queued bills untouched, NOT the sign-out path) — is DESIGNED and taken as commit two / its own
phase with a red-team pass, because it lands in the sync engine's most lesson-dense area. Floor 0 means the server
never refuses the app that exists, so this tree is safe to stop at (S6).
**EDITS THIS COMMIT.** New: `server/app/version_gate.py`, `server/scripts/prove_version_gate.py`. Changed:
`server/app/main.py` (import + the version middleware), `server/.gitignore` (the floor file), and four docs (this
record, `ROADMAP.md` reconciliation (c)/(d) + P1.11, `OPEN_ITEMS.md`, `ARCHITECTURE.md` section 3). Nothing under
`mobile/`, `desktop/`, `packages/`, `tools/`, `.claude/`; no migration; no change to auth, `token_version`, the
login guard, RLS, or any table; the two owner artefacts untouched.
**GATES (each command BARE, exit read in the same invocation; cp874 box).** `prove_version_gate.py` GREEN TWICE
(14 cells, exit 0) plus three disproofs each RED at its named cell. `prove_login_guard.py` (32) and
`prove_grade_tiers.py` GREEN TWICE through the new middleware. `verify_shared_checks.py` IDENTICAL (4 items, 586
chars), exit 0. `build_all_lessons.py --check` exit 0 (62 lessons, 515898 bytes; NO lesson added). `verify_citations.ps1`
over the named 14 (call operator, `[string[]]` bound; SOURCES read first): SOURCES=14, CITATIONS 611→613 (delta +2,
both new cross-references resolve), BROKEN=6 — the floor UNMOVED, its exact pre-existing distribution (OPEN_ITEMS
×4, SRS_MAP ×1, nemesis ×1); ARCHITECTURE, PROJECT_STATUS and ROADMAP at BROKEN=0, so ZERO new breaks. The 611
baseline is 241c959's reading. `reconcile.py` NOT run — no migration/schema change (the floor is a file). Both
mobile typecheck programs UNAFFECTED and not re-run: `git status --porcelain` shows no `mobile/` path — the change
is server Python only. `git diff --stat` = 6 tracked files changed (197 insertions, 2 deletions) plus 2 new
(`server/app/version_gate.py`, `server/scripts/prove_version_gate.py`).

**THE OPEN DOOR — LOGIN RATE-LIMITING, ACCOUNT LOCKOUT, AND A FAILED-LOGIN RECORD. 2026-09-01.** No sha yet
(this record precedes the commit; anchor next pass). The current-phase pointer, superseding the
blueprint-adoption pointer below AS THE POINTER ONLY — that adoption stands and this phase builds under it.
Blueprint 13.3 and the STEP-4 no-dependency cluster at
`ROADMAP.md § The product blueprint, reconciled — 2026-09-01`: the one item that waited on nothing and closed
a hole that was open right now.
**WHAT IS BUILT.** `POST /auth/login` now derives a temporary account lockout from an append-only counter.
Migration `0016` adds `failed_login_attempts (id, tenant_id, username, outcome, created_at)` — RLS+FORCE,
append-only at the grant level (SELECT+INSERT; UPDATE/DELETE revoked from `recycle_app`). `server/app/login_guard.py`
holds the bounds (`FAILURE_THRESHOLD`=5, `LOCKOUT_WINDOW`=15 min) and the SQL: a login counts `failed` rows for
`(tenant_id, submitted-username)` in a trailing window (after the last admin-unlock marker) and refuses at the
threshold with a body BYTE-IDENTICAL to a wrong password; the lock auto-expires as the failures age out; an
admin clears it early at `POST /users/{user_id}/unlock-login` (append a marker, never a DELETE). NO password
material is stored. `scripts/reconcile.py` registers the table (S1/S2/S3/X2) and records its one X2 boundary
(a bogus-tenant row) in `CANNOT_SEE`.
**KEY DECISIONS, each argued in the code/migration.** Keyed on `(tenant_id, username)` because reaching a real
account forces the real tenant through RLS; the lock AUTO-EXPIRES so a stranger causes only a bounded,
self-healing outage and a guesser gets ~5 tries per 15 min per account; `tenant_id` and `username` carry NO FK
(unverified caller input — a login against a shop or user that does not exist must record, not raise); it FAILS
CLOSED (the counter shares fate with the login's own DB read); the refusal DISCLOSES NOTHING (the
username-oracle question stays the owner's — the admin unlock route is the channel that reports the state).
SEPARATE from `users.is_active` (the durable admin lock); neither reuses the other. TWO CHOICES GO BEYOND THE
BRIEF and are the reusable part, argued in `app/login_guard.py`: the lock is DERIVED from the record, not stored,
so it self-heals and needs NO unlock path for the owner's OWN lockout (the admin route only speeds a staff
recovery); and the locked path pays a `DUMMY_HASH` verify, closing a timing oracle for "this account is locked"
that the brief never named. A self-healing derived state and an equalised refusal cost carry to the next guard.
**PROVEN, headless.** `scripts/prove_login_guard.py` — 32 cells over real HTTP (its own child uvicorn on a
scratch), GREEN TWICE with `--skip-restore` between, plus the four disproofs: (b) bypass-the-lock and (c)
unknown-user-body each red EXACTLY their named cell; (a) remove-the-increment reds the lock cell AND the
recording-dependent family, which is CORRECT and NOT a relaxed rule — removing the increment removes the very
FACT those cells observe, so a single-cell red would have meant the others were green for some reason OTHER than
the behaviour they name; the no-password-material cell's presence sibling reds too, catching the vacuous absence
that a bare "password not found" over zero rows would have passed. (d) log-the-password reds the
no-password-material cell alone. `alembic upgrade head` exit 0 with the schema read back field-by-field from `information_schema`;
downgrade+upgrade proven on a SCRATCH, both 0. S5 — every login proof that submits wrong passwords is green
twice: `prove_auth`, `prove_revocation` (standalone AND chained inside `prove_user_create`), `prove_user_create`
(133 cells); plus correct-password smoke tests `prove_bills`, `prove_master`, `prove_grade_tiers`. No seeded or
per-run account tripped the lockout.
**EDITS THIS COMMIT.** New: `migrations/versions/0016_failed_login_attempts.py`, `app/login_guard.py`,
`scripts/prove_login_guard.py`. Changed: `app/main.py` (the login body), `app/users.py` (the unlock route),
`scripts/reconcile.py` (register the table + a `CANNOT_SEE` entry), and four docs (this record, `OPEN_ITEMS.md`,
`ROADMAP.md`, `ARCHITECTURE.md § 4. The data model`). Nothing under `mobile/`, `desktop/`, `packages/`,
`tools/`, `.claude/`; no
second migration; no change to JWT issuance, `token_version`, any existing table, or any existing RLS policy;
the two owner artefacts untouched.
**WHAT IS NOT BUILT, recorded not done.** Rate limiting proper (per-IP / global, blueprint 13.12), the password
route's free guessing, and the table's retention/prune — all held at
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's`, where the gap stays ONE whole-system item so
that guarding login does not read as fixing the system.
**GATES (each command BARE, exit read in the same invocation; cp874 box).** `reconcile.py` exit 0 (15 tables,
S2 green, X2 attributes `failed_login_attempts=0`, VIOLATIONS 0). `verify_shared_checks.py` exit 0 (IDENTICAL,
4 items, 586 chars). `build_all_lessons.py --check` exit 0 (62 lessons, 515898 bytes; one lesson added this
commit). `verify_citations.ps1` over the named 14 (call operator, `[string[]]` bound; SOURCES read first):
SOURCES=14, CITATIONS 607→611 (delta +4, every new one resolves), BROKEN=6 — the floor UNMOVED, its exact
pre-existing distribution (OPEN_ITEMS ×4, SRS_MAP ×1, nemesis ×1); PROJECT_STATUS, ROADMAP and ARCHITECTURE at
BROKEN=0, so ZERO new breaks. The 607 baseline is 40a06cd's reading.

**ADOPT THE PRODUCT BLUEPRINT AS THE PLAN OF RECORD. 2026-09-01.** No sha yet (this record precedes the
commit; anchor next pass). The current-phase pointer, superseding the phase-E pointer below AS THE POINTER
ONLY — phase E's build stands, and this phase touches NO product code. The owner approved a product plan —
"ตามนี้ทำงานเลย" (Thai verbatim, never translated) — and it is now the repository's plan of record:
`PRODUCT_BLUEPRINT.md` is admitted as the product authority, and `SYSTEM_INVENTORY.md` as its predecessor
draft, kept as the record and marked superseded in scope by a one-line header.
**WHAT IS AUTHORISED: NOTHING BEYOND WHAT THE ROADMAP ALREADY CARRIED.** The blueprint is the plan of record,
not a work order. Its fourteen schema-touching decisions and the field research it names (blueprint section
18 — 2–3 shop visits, an accountant, the lawyer/PDPA of P1.1) gate the next stage; nothing in the blueprint
is built or scheduled by this adoption.
**WHERE THE WORK LIVES.** The reconciliation (collisions, what is already built, what is already homed) and
the no-owner-decision start list are at `ROADMAP.md § The product blueprint, reconciled — 2026-09-01`; the
four scope collisions and the fourteen-item schema queue, each marked NOTHING IS AUTHORISED, are at
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's`.
**EDITS THIS COMMIT (six).** `git add` of the two documents; the one-line supersession header on
`SYSTEM_INVENTORY.md` (its body otherwise unchanged); two SET_FILES tuples in `tools/build_paste_set.py` so
the advisor's paste set carries the plan; the ROADMAP reconciliation section; the OPEN_ITEMS collisions and
queue; and this record. No product code anywhere; no migration; no P/S/D number minted; no blueprint content
rewritten; no ROADMAP heading renamed, deleted or reordered.
**TWO COUNT-WORDS CORRECTED in `tools/build_paste_set.py` as part of the SET_FILES change** (the owner's
call): the module docstring's "ten declared files" → "twelve" and `dirty_set_paths`'s "the nine paths" →
"the twelve paths" — SET_FILES re-counted by hand (ten before, twelve after). The "nine" was ALREADY stale
before this change (SET_FILES held ten). A sweep of the whole tool and of PROJECT_STATUS/OPEN_ITEMS/ROADMAP/
START_HERE/CLAUDE for any other quantifier NAMING the set found none — every functional count uses
`len(SET_FILES)`, and the "nine/twelve" hits elsewhere name `.claude/` skills, per-commit declared file sets,
or the R-number census, not the paste set.
**THREE DISCOVERIES RECORDED, NOT FIXED (out of this phase's bounds).** The blueprint's own section 8 and
`SYSTEM_INVENTORY.md` 5.2 both say `users` has no `is_active`; it does (migration 0007, `c9356a2`) — the
owner's documents are left unedited and the correction lives in the ROADMAP reconciliation section.
`ARCHITECTURE.md`'s `users` row carries the same stale claim, and the label "D1" names two decisions across
files (the money rule is E1); both are filed at `OPEN_ITEMS.md § Documentation`.
**CITED, NOT MACHINE-CHECKED:** the two owner artefacts carry zero `§`-citations and stay OUT of the citation
source list (SOURCES=14, floor 6 unchanged), so a reference into them is by number in prose, never a handle —
the reasoning and the `README.md` precedent are in the ROADMAP reconciliation section.
**GATES (headless; each command BARE, exit read in the same invocation; cp874 box).** `verify_shared_checks.py`
IDENTICAL (4 items, 586 chars), exit 0. `build_all_lessons.py --check` exit 0 (61 lessons, 511975 bytes).
`verify_citations.ps1` over the NAMED 14-file source list (call operator + `[string[]]`; SOURCES read first):
SOURCES=14, CITATIONS 584 → 607 (delta +23, every new one resolves), BROKEN=6 — the floor UNMOVED, its exact
pre-existing distribution (OPEN_ITEMS ×4, SRS_MAP ×1, nemesis ×1); ROADMAP and PROJECT_STATUS at BROKEN=0, so
ZERO new breaks. The 584 baseline was measured at `bcdb97a` in a throwaway `git worktree` (the two owner
artefacts are NOT in the source list — they carry no `§`-citations, so adding them would only fire the
non-empty control; SOURCES stays 14 and the floor stays 6). One self-inflicted break each in ROADMAP and
OPEN_ITEMS was caught and fixed before this reading: a `§ 4. The data model` citation that wrapped a line
(CLAUDE's "one line at both ends"), and a "Price history" label that gave a live handle a second hit (hyphenated
to "Price-history"). `build_paste_set.py --check` exits 1 as designed — it detects the drift (declares 12,
manifest 10; the two new files declared-but-absent); the `--check → --write → --check` regeneration is owed in
the post-confirmation sequence. `git diff --stat` = exactly the six named files, 1118 insertions, 3 deletions.

**P1.23 ITEM 3 — PHASE E: THE FULL UX/UI REWORK. 2026-09-01.** No sha yet (this record precedes the
commit; anchor next pass). The current-phase pointer, superseding the phase-D pointer below; phase D's work
stands — this is the rework the owner authorised once the cosmetic constraints (no new Thai / no new
dependency / no new screen / presentation-only / one screen at a time) were LIFTED, so phases C/D could
only move existing boxes. Full method + the deps case: `ROADMAP.md § P1.23 — The mobile UX rework` (PHASE E).
**THE OWNER'S INSTRUCTION IS THE AUTHORITY (Thai verbatim, never translated):** "คือ ที่ผมต้องการคือ rework
ux ui ใหม่ทั้งหมด เหมือนตอนนี้ ux ui แม่งเหมือน สมัย 2000 อ่ะ นี่ 2026 แล้วนะ … ผมปลดโซ่ ไม่มีข้อจำกัดทำเลย
แต่อย่าทำให้ไฟล์อื่นเสียรับผลกระทบ".
**BUILT.** FOUR DEPENDENCIES (`npx expo install`, SDK-54-matched; the owner approved each; New Architecture
already on by SDK-54 default so Reanimated 4 needed no arch flip): `react-native-reanimated@~4.1.1` +
`react-native-worklets@0.5.1`, `react-native-gesture-handler@~2.28.0`, `expo-haptics@~15.0.8`,
`@expo/vector-icons@^15.0.3` (Feather). NO custom font (system stack renders Thai + is sunlight-tuned;
custom risks Thai coverage + CP874). The install was MEASURED inert — both typechecks + the full suite were
unmoved by it before any use. NEW `src/money/format.ts` — `display()`/`stripSeparators`, integer grouping
by pure string surgery (no arithmetic/rounding/Number/toFixed/Intl), applied ONLY at render sites; builders
pass raw strings. `theme.ts` split the accent (`primary` = text/link/border; new bright `primaryFill`/
`onPrimaryFill` = every CTA — the owner's light-accent fix) and gained a `MOTION` group. NEW component
vocabulary `app/Kit.tsx` (Card/GroupCard/SectionHeading/Row/Divider/Segmented/Figure/Badge/Button/
EmptyState/Field) + `app/Press.tsx` (`Touchable` — press-scale on the UI thread + commit haptics) +
`app/Icon.tsx` (Feather map). EVERY screen rebuilt on it: LoginScreen, the App.tsx shell (top bar, icon-
label nav pills, ranked notices, start-bill EmptyState), CartScreen, DashboardScreen, PricesSheet,
SettingsScreen (new `ข้อมูลร้าน` / `เครื่องนี้` section headings; segmented → reference raised-pill),
AccountScreen, SellerPicker, AddSellerSheet, BillsPanel, SellerHistorySheet, BillList, ConfirmSaveDialog,
ConfirmSellerChangeDialog, SignOutSheet, NoticeSheet, TierActionsSheet, SheetHeader, the three strips
(dropped the >1px coloured left-rail for a leading dot). Numpad unchanged (its `⌫` is the conventional
keypad backspace; its keys are 100+/day so keep the platform opacity-press, not a scale — animate-expo
frequency gate).
**PROVEN (headless, every command BARE, exit read in the same invocation; cp874 box).** Both typechecks
`EXIT=0` (baseline before + after). The full 45-proof suite green TWICE (run1 + run2), only
`proveLogin`/`proveLoginScreen` exit 1 both times (their server on :8231 not running; no login-logic
change) — every other proof green twice. `prove:theme` **92→98 cells**, each ratio labelled for what it is:
the fill-label pair is TEXT-ON-FILL legibility (the 4.5 rule — `onPrimaryFill on primaryFill` 5.70:1 light /
8.35:1 dark, both ≥4.5); P7 is FILL-VS-GROUND PROMINENCE, a different measurement with NO 4.5 threshold,
reported so the CTA is shown the brightest thing on its screen (light 2.49:1, a bright accent NOT the
rejected ~4.9:1 teal-700 slab; dark 10.06:1); plus the segmented `textMuted`/`surfaceAlt` TEXT pair (6.92:1
light / 12.02:1 dark). A `fill` disproof added; all disproofs redden EXACTLY one cell. **EVERY
text/background pair clears 4.5:1 in both themes — no text pair anywhere is below 4.5** (the notice dot/bar
accent pairs clear their separate 3:1 non-text floor; P7 is prominence, not legibility, no floor).
`prove:money` **36→64 cells** (M5 round-trip over `0.00`/`0.005`/negatives/4-decimals/12-integer-digits; a
`drop_digit` disproof reddens EXACTLY the 23 round-trip cells; M1–M4 unweakened). `prove:tapaudit` ZERO
findings, Cs2 = **0 raw layout literals across 0 files** over all 27 app files. `prove:sheets` green (one
Modal via SheetHost; reachable stacks unchanged). The MONEY PROOFS (`prove:money`/`cart`/`daily`/`dashboard`/
`sellerhistory`/`prices`) green TWICE with the src-builder cell counts UNMOVED — constraint 1's evidence
(the `.tsx` change only wraps an already-produced string in `display()`).
**THAI LEDGER (old→new, file:line).** NEW Thai (section headings, reusing settled roots): `SettingsScreen.tsx`
`ข้อมูลร้าน` (formHead; reuses `ร้าน` from `ตั้งค่าร้าน`) and `เครื่องนี้` (deviceHead; reuses `เครื่องนี้`
from the theme note). All other string changes are decorative-glyph removals, NO wording changed:
`navRow.ts:43-46` `ยอดวันนี้ ›→ยอดวันนี้`, `ราคารับซื้อ ›→ราคารับซื้อ`, `ตั้งค่าร้าน ›→ตั้งค่าร้าน`,
`บัญชีของฉัน ›→บัญชีของฉัน`; `App.tsx` latest-open `ดู/ยกเลิก ›→ดู/ยกเลิก` (and the notice-count `›` → drawn
icon); `CartScreen.tsx` `เปลี่ยน ›→เปลี่ยน`, `เลือก ›→เลือก`, `ดูประวัติการซื้อขายของผู้ขายรายนี้ ›→…รายนี้`;
`SellerPicker.tsx` `+ เพิ่มผู้ขาย→เพิ่มผู้ขาย` (the `+` is now a drawn plus icon); `BillsPanel.tsx`
`⚠ บิลนี้ส่งไม่ผ่าน…→บิลนี้ส่งไม่ผ่าน…` (drawn warn icon); `SheetHeader.tsx` `‹`, `SettingsScreen.tsx`
`↑`/`↓`/`⋯` → drawn icons (no Thai). Rendered sentences elsewhere are byte-identical (the start-bill
EmptyState reuses the existing `ยังไม่มีบิลที่กำลังทำอยู่`). Kept glyph: `Numpad.tsx` `⌫`.
**THE THREE THAT DID NOT BEND.** (1) Money is a decimal string in a `<Text>`, only regrouped at render.
(2) Nothing under `src/sync/` or `src/adapters/sqlite/` changed. (3) Every tap target ≥56, body ≥13px,
contrast ≥4.5 both themes (measured). No server/desktop/packages/tools change; `.claude/` read-only.
**DEFERRED / OPEN (recorded in `OPEN_ITEMS.md`):** the skeleton loading component (L1 — spinners remain);
the padding-sized sheet buttons under 56px (a tap-floor the text-scanner cannot catch); the message-card
consolidation into a Kit component; the `expo-system-ui` (Android auto-dark) finding; and the PLATFORM
DECISION for the device pass (iOS via EAS + Apple Developer membership or a Mac; Android builds on this box
today; the owner's to settle).
**NOT OBSERVED — the plain statement, not a hedge: EVERY visual, motion and haptic claim in this phase is
COMPUTED or COMPILED, never observed; NO human has seen this interface; and the Android dev build HAS NOT
BEEN RUN EVEN ONCE, so even "it compiles on the device" is itself unverified — a green headless suite is
not a working app.** The device pass is OWED on whichever platform the owner builds. The whole visual/
motion/haptic result is a HANDSET observation and none of it is claimed: the bright light-mode CTA, the grouped
money at arm's length, press feel and jank on real hardware, the commit haptics, safe-area insets, the
system-font Thai rendering, nav fit at real widths, and — because Reanimated 4 on the New Architecture
replaces Expo Go — that the **dev build compiles and installs at all** (`npx expo prebuild` is done for
Android on this box; `npx expo run:android` is the owner's next step; iOS needs EAS or a Mac). This is the
ONE consolidated handset list for the new interface; it supersedes the phase-A/B/C/D device lists below,
which were about the pre-rework screens.
**IS A LESSON OWED? NO.** Two self-caught trip-ups: (a) the `Touchable.onPress` type under
`exactOptionalPropertyTypes` refused a `(() => void) | undefined` value passed to an optional-but-not-
`|undefined` prop — a compile error the app typecheck caught and the prop type was widened; caught by the
gate, not a runtime bug class. (b) a proveMoney control that claimed "a Number()/toLocaleString formatter
alters digits" used an input that formatter happened to PRESERVE, so the control went red — replaced with a
deterministic digit-losing control; this is the existing `a-check-that-never-went-red` discipline (a
control that does not fire proves nothing, caught by running it), not a new class. The deps, tokens, money
function and screen rebuilds are the brief's requirements built to spec, not lessons relearned.

**P1.23 ITEM 3 — PHASE D: THE REFERENCE-PINNED SCREEN BODIES. 2026-09-01.** No sha yet (this record
precedes the commit; anchor next pass). The current-phase pointer, superseding the phase-C pointer below;
phase C's work stands — this closes the deferred card-ification unit (W5 / P4).
**THE OWNER'S JUDGEMENT IS THE PHASE'S AUTHORITY (Thai verbatim, never translated):** phase C was still
below his bar — "ตอนนี้มันกากมากเลยนะ UX UI อ่ะ ผมไม่พอใจ" — and prior passes failed because they used the
installed skill as a reference and let the session's OWN design sense do the work: "ทำไม พาแก้ ux ui แต่ไม่ใช้
skills และใช้ความรู้แบบโครต AI เลย ผมก็บอกแล้วให้ใช้ skills ให้ claude code ไปอ่าน ไปใช้ ดิ ทำux ui สวยๆ
frontendสวยๆ". RECON (verified): the pre-installed `ui-ux-pro-max` returns thin/generic guidance; the fix
is the OWNER'S OWN skills, used directly.
**THREE SKILL REPOS INSTALLED** into gitignored `.claude/skills/` (never `--force`): `emilkowalski/skills`
d23d7f8 (animate-expo, apple-design), `pbakaus/impeccable` 5b585c0 (Operate-mode product UI + a native
track — the authority), `leonxlnx/taste-skill` ccbc156 (mostly out of scope). The reference (AllTCAS, ten
screenshots at `E:\reffe`) was read DIRECTLY off disk. METHOD (impeccable new-work.md): inherit theme.ts's
established world, apply impeccable Operate + apple-design + animate-expo craft, PINNED to the reference's
STRUCTURE (inset cards + gaps, grouped rows + muted headings, notices behind a count, one rare accent,
segmented controls, grab-handle sheets). NOT donated: the brand hue, the logo, the mascots, the bottom tab
bar, the gamification. `ROADMAP.md § P1.23 — The mobile UX rework` (item 3, phase D) carries the full method record.
**BUILT (presentation only; no logic/route/store/sync; the one exception is a presentation sheet kind).**
A1 one-accent (money, bar fills and decorative borders off teal; teal only on the primary action, the
selected state and one hero figure per screen; the CART TOTAL is NEUTRAL — weight+size, the CTA is the
accent — the owner's ruling); status tints kept as the semantic vocabulary (A2). RED destructive
(ออกจากระบบ + the deactivate action in the tier menu), with the `danger`-on-`surface`/`background` pair
MEASURED not estimated (4 new prove:theme cells; the 34 pinned colours unmoved). The tier ⋯ menu: rename +
deactivate moved OFF the row (the reorder ↑ ↓ stay) into a new grab-handle bottom sheet
`app/TierActionsSheet.tsx` via the ONE SheetHost, so a wet thumb cannot hit retire beside the arrows; a new
`tier_actions` sheet kind (`settings>tier_actions`, the second two-deep stack). The 23 raw geometry literals
across 12 files → 0. Card corners unified to `t.radius.card`; muted-meta consolidation applied where clean.
**PROVEN (headless, every command BARE, exit read in the same invocation).** Both typechecks green;
`prove:theme` green TWICE — the 4 new danger cells MEASURED: `danger`/surface 6.47:1 (light) / 5.29:1
(dark), `danger`/background 6.18:1 / 6.77:1, all ≥4.5 so the pinned red stands; `prove:sheets` green TWICE
(reachable 13→14 NAMED settings→settings>tier_actions, S9 exactly ONE Modal via the host, S10
open_tier_actions dispatched); `prove:tapaudit` green (Cs2 23→0, zero tap findings, scaffold clean); the
full mobile headless suite green (44 proofs — settings/gradeTiers/account/dashboard/prices/sellerhistory/
saveconfirm/signout/noticeStack/reservestrip/notice/daily/sync/cart/money/entry/seller/void/… plus
`forbidden`, whose F6 hit the real dev server on :8000). `prove:login` and `prove:loginscreen` exit 1 ONLY
on server-availability (their server on :8231 is not running; no change touches login/session/shop-code
logic). NO THAI REWORDED: the byte-level filtered diff shows exactly the 5 tier-label MOVES (SettingsScreen
`<Text>` → TierActionsSheet `<Text>`, byte-identical), 0 added Thai in tracked files.
**DEFERRED (recorded in `OPEN_ITEMS.md`):** the skeleton loading component (L1 — DashboardScreen's bare
spinner is unchanged); the ข้อมูลร้าน / เครื่องนี้ section headings and the empty-state teaching copy (both
NEW Thai — the owner's decision, held under no-Thai-reworded); the full type-rank consolidation (a light
pass done); dependencies for press haptics (`expo-haptics`) and grabbable sheet springs
(`react-native-reanimated`) — the owner decides these separately.
**DELIBERATE DIVERGENCE from the reference (do not "fix" back):** the inline-edit settings fields carry NO
chevron — a › that opens nothing is a promise the screen cannot keep, and the reference's own row→detail
model is the one part "no new screen" forbids; inline edit is one tap. The chevron survives only on the
tier ⋯. Recorded in the ROADMAP phase-D note.
**IS A LESSON OWED? YES, WRITTEN.** `lessons/comment-thai-pollutes-a-moves-only-diff.md`: on a Thai-MOVE
phase, documentation comments and docstrings that QUOTE the moved strings show up as "added Thai" in the
"moves only" filtered diff — a false positive that can hide a real reword or be waved through as a clean
diff. Caught this pass by a BYTE-LEVEL filtered-diff check (removed=5, added_tracked=0), then every comment
was de-Thai'd. The device pass is UNOBSERVED and is the ONE owed handset pass amended below.

 No sha yet (this record precedes the
commit; anchor next pass). The current-phase pointer, superseding the P1.24 commit-3 pointer below;
P1.24's work stands — this is the newer session in time, an earlier step number.
**THE OWNER'S JUDGEMENT IS THE PHASE'S AUTHORITY, recorded as his (Thai verbatim, never
translated):** he read the app on a handset and judged it below the S23 bar — (V0) "UI โครต baby
broomer อ่ะ ไม่ตาม trend 2026 เลย ควรใช้ ux/ui promax นะ skills อ่ะ มันมีอยุ่ผมลงไว้แล้ว" — and
supplied a REFERENCE application (ten screenshots of a Thai consumer app) as the standard: (V0')
"เนี่ย Ux/ui แบบนี้สวย เว้ย มันดูไม่กาก ของผมโครตกากเลย ประยุกต์ใช้สะ". FIRST DEVICE EVIDENCE (V1):
dark rendering works on the handset (OBSERVED). FOUR DEFECTS (V2), each re-derived at the tree and
CONFIRMED: (a) four equal-weight full-bleed notice bars; (b) the header chips overlapped the title
and the last was clipped; (c) the raw API address on the operator's main screen; (d) no spacing
rhythm.
**DESIGN SKILL:** `ui-ux-pro-max` — its react-native stack, the `web`/app-interface rules
(SafeAreaView, 8dp touch spacing, `accessibilityLabel`/selected-state), the dimensional-layering
elevation scale, and the Quick-Reference hierarchy / one-accent / token-driven rules. Its
`--design-system` style pick (a sci-fi HUD) was off-target and DISCARDED per the skill's own
verify contract; `ui-styling` was inapplicable (shadcn/Tailwind, not React Native).
**BUILT (presentation and hierarchy only; no wording, no logic, no route/store/sync change).**
`src/ui/theme.ts` gains an elevation step, a `LAYOUT` group (outer margin, card gap, card padding,
scroll gutter, sheet inset) and a card radius rung — the 34 contrast-covered colours UNTOUCHED, so
every `prove:theme` cell holds. `src/ui/noticeStack.ts` is a pure ranked builder over the three
alert notices (session/sync, stale prices, reserve): the blocking notice inline, OR — with no blocker
— a LONE non-blocking notice (owner-refined 2026-09-01: one line is no stack, not worth a tap behind
a count), the rest behind a count that appears only when a blocker leaves others or two-plus
non-blocking notices remain. `app/NoticeSheet.tsx` is the count's bottom sheet (grab handle) — a new `notices` sheet
kind, so `prove:sheets` moved 12→13 reachable (stated; the stale ELEVEN docblock corrected). The
header is a fixed top bar (wordmark + separated ออกจากระบบ) over a horizontal scroll nav row built
from `src/ui/navRow.ts` (a checked model). The API address moved off the operator status to a
settings diagnostics card (W3). Eight sheet heads unified onto one `app/SheetHeader.tsx`; the theme
control became a SEGMENTED control; the three strips and the last-bill became cards; the main screen
is an inset card page. `src/ui/tapAudit.ts` gains `scanLayoutLiterals`, which asserts the page-model
scaffold (App.tsx + SheetHeader) draws its geometry from tokens and REPORTS the app-wide raw-geometry
count (34→23; the residual is a follow-up unit).
**PROVEN (headless, every command bare, exit read in the same invocation):** both typechecks green
before and after; `prove:theme` (every contrast ratio printed for the UNCHANGED palette),
`prove:noticeStack` (18 cells, up from 15; N0–N5, SIX disproofs each reddening EXACTLY its cell —
drop/inline/force_count/order/map/nav — an unknown break exits with no banner; the phase-C lone-inline
rule is its own cell, with the blocker-plus-one boundary and the two-notice sibling pinned against the
real function), `prove:sheets` (13 reachable, one Modal, all
transitions dispatched), and `prove:tapaudit` (zero tap findings AND the scaffold clean; the W3 URL
cell; two disproofs) all green TWICE. Every OTHER headless mobile proof green TWICE with counts
UNMOVED — 42 proofs swept; the three live-server auth proofs (proveForbidden/proveLogin/
proveLoginScreen) NOT run (no server). NO THAI STRING CHANGED: the `git diff` filtered to Thai-range
lines shows only MOVES — every removed UI string reappears; the cross-file moves are the eight sheet
titles + `ปิด` → `app/SheetHeader.tsx`, and the four nav labels `App.tsx` → `src/ui/navRow.ts`.
**DEFERRED (W5), recorded in `OPEN_ITEMS.md`:** the remaining screen BODIES' card-ification and
list-rows (amendment P4), and the residual 23 raw geometry literals across 12 files.
**IS A LESSON OWED? NO.** Two text-scan trip-ups this pass — a docstring writing `<Modal` reddened
`prove:sheets` S9, and a docstring writing a raw `paddingTop` value reddened the new scaffold cell —
were SELF-CATCHING (the proof went red, the comment was de-literalised) and each scanner's docstring
already says it reads TEXT and so matches a literal in a comment. No silent bug class was found. The
rule for whoever extends those scanners next (they will hit it in the same minute): a source-text
scanner reads its own prose, so a scanner's documentation must not contain the literals it hunts.

**P1.24 — COMMIT 3: THE SERVER F1 GUARD, THE REORDER ROUTE, AND THE PHONE'S REORDER CONTROL.
2026-08-31.** No sha yet (this record precedes the commit; anchor next pass). The current-phase
pointer, superseding the Phase 2 pointer below. Two follow-ups the owner ordered before P1.24 is
called done.
**SERVER (server/app/master.py), NO migration (sort_order is 0015's column; both are handler
logic).** (1) THE F1 LAST-ACTIVE GUARD, owed not queued: `PATCH /grade-tiers/{id}` `is_active=false`
now refuses deactivating the shop's LAST active tier with its own 409 `grade_tier_last_active`
(detail carries `active_tiers`), checked BEFORE the in-use check — zero active tiers breaks F2
seating, and curl reaches the route directly, so the phone's `mayDeactivate` is a courtesy and this
is the authority (two layers, correct). (2) THE REORDER ROUTE, one write not two PATCHes: `PUT
/grade-tiers/order` takes the shop's WHOLE ordering (every tier id EXACTLY once) and rewrites
`sort_order` from position in ONE transaction (`tenant_connection`'s `conn.begin`); a duplicate,
missing or foreign id is a 422 `grade_tier_order_invalid` naming `order`. An ordering is one fact
about the set, so it moves as one write and cannot half-apply. Concurrency, stated: one admin
assumed (a shop has one back office); racing PUTs are last-write-wins over the whole ordering,
never a partial one.
**PHONE (mobile/).** `api.ts` `reorderGradeTiers`; `gradeTierAdmin.moveActiveTier` (the full new
order after a move up/down over the active list, inactive tiers after) + `canMoveUp`/`canMoveDown`
row flags + `tierActionOutcome` now words `grade_tier_last_active`; `SettingsScreen` gains ↑/↓
controls on each active tier (one PUT of the whole order per move, `TAP_MIN`, admin-only). The
client `mayDeactivate` guard STAYS.
**PROVEN (each command BARE, exit read in the same invocation; cp874 box, `PYTHONIOENCODING=utf-8`).**
SERVER: `prove_grade_tiers.py` (scratch + own uvicorn, self-restored from dev; live dev READ only)
EXIT=0 TWICE with NEW cells L (the last-active guard: deactivate down to one → 409
`grade_tier_last_active` `active_tiers=1`, operand printed; with two active, deactivating one → 200;
reactivating restores the ability) and M (reorder: read back OUT OF POSTGRES, reversed as the
control, a partial list → 422, a foreign id → 422, UNCHANGED after the refusals — a rejected
ordering wrote nothing). Two DISPROOFS each reddened EXACTLY their cell and reverted: (e) drop the
last-active guard → cell L (409→200, zero active left); (f) drop the reorder set-equality check →
cell M's validation cluster (422→200, half-rewrite). No DISPROOF remnant in `master.py` (grep
clean). PHONE: both typechecks EXIT=0 (node + app, before AND after). `prove:gradeTiers` EXIT=0
TWICE, now 43 cells (was 34 in Phase 2; +9 = G5's last-active refusal ×1 and G7 reorder ×8); its
three disproofs still redden EXACTLY one cell each (`deactivate_last`→G2, `hide_last_tier`→G3,
`drop_count`→G5's count — the new last-active check has no digit, so `drop_count` leaves it green).
`prove:tapaudit`, `prove:sheets` EXIT=0 (the ↑/↓ controls are themed, no raw min-size, no new Modal).
**THE OPEN_ITEMS F1 LINE IS CLOSED (dated, naming this commit); the reorder-deferred line is CLOSED
(reorder is BUILT, not deferred).**
**DONE WHEN, READ LITERALLY: NOW HELD IN FULL.** With the guard and the reorder route, a shop
declares, names, orders, and retires its tiers with every invariant enforced server-side (F1..F4)
and the phone carries all of it (F0). The only unobserved piece is the device pass (the consolidated
handset list). The Phase-2 "22 cells" undercount is corrected in that record below.
**IS A LESSON OWED? NO.** The two disproofs are the same reddens-exactly-one-cell discipline already
carried by `a-check-that-never-went-red-was-never-observed`; the last-active guard and the
one-transaction reorder are the F1/atomicity requirements the brief named, built to them, not
lessons relearned. The "22 cells" miscount is a measurement carried unmeasured — already the
`CLAUDE.md § Shared checks` "a measurement being carried as a fact" rule; the fix is the recount and
the record, not a new lesson.

**P1.24 — THE PER-TENANT GRADE MODEL, PHASE 2: THE PHONE. 2026-08-31.** No sha yet (this
record precedes the commit; anchor next pass). This WAS the current-phase pointer until the
commit-3 record above.
**BUILT and PROVEN HEADLESS; NO device pass claimed** (CLAUDE.md § Boot check "WHICH BUNDLE THE
HANDSET IS RUNNING"). The handset replaces the hardcoded grade set with the shop's own fetched tiers.
**M1 — FETCH + CACHE.** `GET /grade-tiers` (active only) is fetched in `refreshMaster` beside
products and sellers and cached in a NEW `cached_grade_tiers` table (`code, name, sort_order,
owner_tenant_id`) — a third master list with its own `master_cache` stamp, tenant-scoped and
delete-all-insert-all like the other two (`MasterGradeTier` / `saveGradeTiers` added). The hardcoded
`GRADES = ["A","B","C","D"]` is DELETED; the price screen enumerates the fetched tiers, gated on a
new `haveGradeTiers` (the upgraded-handset "tiers not downloaded" empty state).
**M2 — SETTINGS TIER MANAGEMENT.** New pure module `gradeTierAdmin.ts` (`readGradeTiers`,
`tierAdminScreen`, `validateNewTier`/`validateRename`, `tierActionOutcome`) + settings UI: declare /
rename / deactivate / reactivate, admin-only (staff read-only), the F4 deactivation refusal showing
the count. Default-grade options are the shop's ACTIVE tiers by NAME; F2 hides the whole
default-grade control at exactly one active tier (`showGrade`), and the tier LIST is never hidden.
**M3 — SURFACES READ NAMES (F3).** `tierName(tiers, code)` (`cart/sellers.ts`) resolves a seller's
grade code to the shop's NAME across picker / cart / confirm-save / confirm-change / price screen,
falling back to the code. `PricesSheet`'s `width:24` one-glyph grade column FIXED (a Thai name
overflowed it) — content-sized `flexShrink`, no raw min-size (`prove:tapaudit` compliant); add it to
the consolidated handset list.
**LOCAL STORE — no migration, no queued bill at risk** (reported BEFORE editing, grounded in
`schema.ts`): the grade columns are already unconstrained TEXT, the offline seller's grade is
unconditionally NULL (seated server-side on sync), no queued bill carries a grade (grade left bill
items in 0003), and `cached_grade_tiers` is additive.
**PROVEN (each command BARE, exit read in the same invocation; cp874 box).** Both typechecks EXIT=0
(`typecheck` node + `typecheck:app`). `prove:gradeTiers` (NEW, 34 cells — the commit body 66f2e20
says "22 cells", an UNCOUNTED estimate; recounted 34, definition: `check()` output lines) EXIT=0
TWICE; its three
disproofs each reddened EXACTLY one cell and reverted (`deactivate_last`→G2; `hide_last_tier`→G3;
`drop_count`→G5). `prove:prices` and `prove:settings` rewritten off `GRADES`, EXIT=0 TWICE each; the
`prove:settings --break=hardcode_grades` disproof reddens S2 (options track the shop's tiers by
value AND name). `prove:migration` EXIT=0 (now tracks `cached_grade_tiers` in `readShape`, its four
columns; the M2 SIGKILL rollbacks still clean; no cell count moved). `prove:sheets`, `prove:tapaudit`,
`prove:cold`, `prove:cachetenant`, `prove:seller`, `prove:cart` EXIT=0 (no regression).
**NOT RUN, NAMED: the phone's REAL-HTTP round** — `app/api.ts` reaches expo-constants and cannot be
proof-imported, and an end-to-end phone→server round is a DEVICE PASS (outside this phase's
no-device-pass scope). The fetch→parse seam is covered by `prove_grade_tiers.py` (server, real HTTP,
the payload shape) + `proveGradeTiers` G0 (the phone's `readGradeTiers` over that exact shape). A
green not run today is not written as green.
**TWO FINDINGS, recorded in `OPEN_ITEMS.md`:** (1) the SERVER does not refuse deactivating the LAST
active tier — 0 active tiers breaks F2 seating; the phone guards it client-side (`mayDeactivate`),
the server guard is OWED. (2) TIER REORDER is deferred — a two-PATCH `sort_order` swap, better on the
desktop's fuller admin; the shop orders by add-sequence, and the owner should ratify or override.
**IS A LESSON OWED? NO.** The `prove:tapaudit` raw-min-size catch is already enforced by that check;
the disproof-reddens-two-cells nit was caught by RUNNING every disproof (existing discipline) and
fixed (read the F1 guard as a SET so it is vacuous, not red, on the hidden-list break); the F1 server
gap is a FINDING about existing server code, recorded as owed work, not a mistake this phase made.

**P1.24 — THE PER-TENANT GRADE MODEL, COMMIT 1b: the routes (S6 split, second commit).
2026-08-31.** No sha yet (this record precedes the commit; anchor next pass). This WAS the
current-phase pointer until the Phase 2 record above.
**BUILT and PROVEN over real HTTP; NO device work — that is Phase 2.** `server/app/master.py`
gains the grade-tier routes and turns the removed `Grade = Literal["A","B","C","D"]` into
run-time validation against the shop's OWN tiers.
**ROUTES.** `GET /grade-tiers` (staff-readable — the phone prices with them; active by
default, `?include_inactive` for the back office), `POST /grade-tiers` (admin; a duplicate
code is a 409; NO product ceiling, F1), `PATCH /grade-tiers/{id}` (admin; name / sort_order /
is_active; `code` IMMUTABLE — the FK target, F4's rename answer). NO DELETE route (F4).
**DEACTIVATION REFUSAL (F4).** `PATCH /grade-tiers/{id}` is_active=false refuses while ACTIVE
sellers sit in the tier — 409 `grade_tier_in_use`, detail carries `sellers_in_tier`. 409 not
403: it is the tier's STATE that conflicts, not the caller's role. Move the sellers (`PATCH
/sellers` grade), then deactivate → 200.
**GRADE VALIDATION (S16).** `_validate_grade(conn, grade, must_be_active)` — 422
`grade_not_a_tier` if the code is not a tier in this shop (RLS-scoped, so another shop's code
is simply not found → the READABLE 422 replacing the composite FK's IntegrityError 500), and
422 `grade_inactive` where an active tier is required. Applied to `PUT /products/{id}/prices/
{grade}` (existence only — a shop may price any tier it holds), `POST/PATCH /sellers` grade
(active), `PATCH /shop` default_grade (active). Re-derived every grade-accepting route (`rg
grade server/app/`): those four changed; `bills.py` accepts NO grade from the client (it READS
seller.grade, now always a valid tier code or NULL) and is UNCHANGED — its default_grade
fallback and the 424 stand, the flagged fallback-vs-per-seller question NOT reopened.
**F2 SEATING.** `create_seller` resolves the grade ONCE after the code lock, before all three
create paths (token / code-supplied / mint): a supplied grade is validated (active tier); an
ABSENT grade SEATS the seller in the shop's sole active tier when there is exactly one (F2 — no
office round trip, and not a guess: it is the only grade the shop has); it stays NULL among
several tiers or none.
**PROVEN (every command bare, exit in the same invocation; PYTHONIOENCODING=utf-8 on this cp874
box).** `import app.main` clean; `/openapi.json` declares GET+POST `/grade-tiers`, PATCH
`/grade-tiers/{tier_id}`, PUT prices, /sellers, /shop (37 paths). `prove_grade_tiers.py` (NEW —
scratch + own uvicorn, identity-gated) EXIT=0 TWICE, 30 cells: the DONE WHEN out of Postgres (12
Thai-named tiers in the shop's own order — F1, no ceiling; a seller in a tier; a bill priced
'44.00' byte-for-byte; the one-tier F2 walk-in SEATED in 'มาตรฐาน' with no round trip), the
deactivation refusal naming the count, move-then-deactivate, F4 history intact + include_inactive
resolving the retired tier, a foreign code 422, RLS-scoped GET (each shop sees only its own),
staff GET 200 / staff POST 403 `admin_required`, PATCH /shop default_grade validated. Two route
DISPROOFS each reddened EXACTLY their cell and reverted: (a) drop the deactivation in_use check →
cell E (409→200, no count); (c) drop `_validate_grade` in update_shop → cell K (readable 422 → the
FK's 500). Disproof (b) is SAID not staged (RLS + `_validate_grade`, not the FK, holds the
route-level cross-tenant refusal — the unit-2 precedent); disproof (d) is a 1a-migration concern
(backfill), vacuous here (this proof builds tiers through the route). The route-grade proofs re-run
GREEN TWICE against the changed routes: prove_seller_create (POST /sellers grade + PUT prices + the
reservation/mint paths), prove_seller_code_guards (offline grade), prove_shop_settings (/shop). Thai
tier names compared as PYTHON STRINGS read out of Postgres (byte-for-byte, no console).
**NOT RUN, NAMED (external-server grade proofs writing into dev).** prove_master_write,
prove_master_data_gate, prove_seller_pricing, prove_master, prove_daily_report test the grade routes
against dev Shop A (tiers A-D present): their valid-grade paths (A/B/C) pass because those are active
tiers, and their foreign-grade refusal (PUT prices/Z → 422) is the SAME `grade_not_a_tier` 422 that
prove_grade_tiers cells H/K and prove_seller_create now exercise on the changed routes; each needs a
:8099 API writing dev debris. Covered by the four route proofs green twice, so named.
**NOT OBSERVED / NOT BUILT: the PHONE (Phase 2)** — the tier set on the handset, settings
tier-management, F2 hiding the grade control. No device work in 1b.
**IS A LESSON OWED? NO.** The Grade-Literal → run-time validation was foretold by priceEdit.ts's own
S16 note; the disproof cell that crashed on a non-JSON 500 body under disproof (c) was made defensive
(a clean RED, not a crash), and crash-as-failure is already `a-check-that-never-went-red` /
`a-default-exit-code-is-a-default-verdict`. No new class.

**P1.24 — THE PER-TENANT GRADE MODEL, COMMIT 1a: the schema, the backfill, the
operational surfaces (S6 split). 2026-08-31.** Committed at `ad2806e`. This WAS the
current-phase pointer until the 1b record above.
**BUILT and PROVEN on dev; NO device work and NO new routes in this commit — those are 1b.**
Migration `0015_tenant_grade_tiers.py` creates the per-tenant `grade_tiers` table (S16's
TABLE replacing a CHECK), applied to dev `recycle` (`alembic current` = 0015). Columns
re-read from `information_schema`: `id` uuid PK (gen_random_uuid), `tenant_id` NOT NULL →
tenants, `code`/`name` text NOT NULL, `sort_order` int NOT NULL, `is_active` bool NOT NULL
default true, `created_at` timestamptz. Constraints: `uq_grade_tiers_tenant_id (tenant_id,id)`,
`uq_grade_tiers_tenant_code (tenant_id,code)`, `ck_grade_tiers_code_len (1..32)`,
`ck_grade_tiers_name_len (1..100)`; RLS ENABLE+FORCE+`tenant_isolation`; grants
SELECT/INSERT/UPDATE, DELETE REVOKED (F4).
**THE RE-POINT (FK target = `code`, not `id`).** The three A–D CHECKs — `product_prices_grade_check`
(0001, inline/auto-named), `ck_sellers_grade` (0003), `ck_tenants_default_grade` (0010),
re-derived from `pg_constraint`, NOT the log's mistaken "four/five sites" (`purchase_bill_items.grade`
was DROPPED by 0003 and does not exist) — are DROPPED. `product_prices.grade` and `sellers.grade`
become composite FKs `(tenant_id, grade) → grade_tiers (tenant_id, code)`; `tenants.default_grade`
becomes `(id, default_grade) → grade_tiers (tenant_id, code)`, nullable/MATCH SIMPLE. `code`
over `id`: the grade columns keep their type and every existing read/write keeps working; the
composite FK on `code` carries `tenant_id`, so ARCHITECTURE § 4 point-1 tenant-consistency holds;
the `name` is the freely-renameable display (F3), the `code` the stable handle (F4's rename answer).
**THE BACKFILL (from data present, MEASURED on dev, read back from Postgres).** One tier per
distinct grade a tenant uses across product_prices/sellers/default_grade; a no-grade tenant gets
ONE tier code='A' (F2 — the programme's neutral placeholder, never shown). Shop A `1111` and Shop
B `2222` each {A,B,C,D} sort 0-3; `982d76af` and `a45432ea` each one 'A' — 10 tiers, 0 orphans
(positive control: a fake code returns 1).
**FORCE-RLS backfill.** Migrations run as `recycle_owner`, FORCE-bound → reads 0 rows with no
context; the migration lifts FORCE on the three source tables (owner-only; recycle_app stays
governed), backfills, restores FORCE — measured (owner reads 0/0/0 with FORCE, 24/11/4 with NO
FORCE, rollback left forced=t). The downgrade GUARD had the same trap (would read 0 and silently
drop invented tiers) and was fixed to lift FORCE. **LESSON WRITTEN**:
`lessons/a-migration-reads-zero-under-force-rls.md`.
**WHICH GRADE VALUES EACH ROUTE STILL ACCEPTS AFTER 1a, AND THE KNOWN GAP.** The routes are
UNCHANGED in 1a: `POST/PATCH /sellers`, `PUT /products/{id}/prices/{grade}`, `PATCH /shop
{default_grade}` still validate a grade against the pydantic `Grade = Literal["A","B","C","D"]`.
For the seeded shops (A/B) the backfill guarantees tiers A–D, so those routes work on exactly the
values they used before. Nothing is yet validated against a shop's OWN tier set. A newly-provisioned
shop is a ONE-TIER shop (`provision_shop.py` seeds one tier 'A', default_grade NULL): its routes
accept only 'A'; a B/C/D would pass the Literal but be **refused by the composite FK (an
IntegrityError), NOT by a readable 422** — that readable validation, and the `/grade-tiers` routes
to DECLARE more tiers, are commit 1b. This is the named GAP of 1a.
**OPERATIONAL SURFACES.** `reconcile.py` learns grade_tiers (TENANT_TABLES/SCOPE_SQL/SCOPE_COLUMN;
T10 gains three grade-tier resolve arms joined on `code` under RLS — X1 is NOT used, because `code`
is unique only within a tenant and the composite FK already forbids cross-tenant); its constraints
are deliberately NOT in REQUIRED_CONSTRAINTS (the 0012 dump wake-condition). `provision_shop.py`
seeds one starter tier. `seed_dev.py` seeds tiers before its graded rows. `backup_db.py`/`restore_db.py`
are catalogue-driven — no edit; the round-trip carries grade_tiers.
**PROVEN (every command bare, exit in the same invocation; PYTHONIOENCODING=utf-8 where a proof
does not self-reconfigure stdout on this cp874 box).** `alembic upgrade head` on dev EXIT=0,
`alembic current`=0015, information_schema rows printed. Down-then-up on scratch (0015→0014→0015)
both EXIT=0, CHECKs restored on the way down, the GUARD refuses a renamed tier (EXIT=1). Backfill
read back: 10 tiers, 0 orphans + positive control. `reconcile.py` on dev EXIT=0, 0 violations —
S1/S2 "14 tables in public" (was 13, grade_tiers, a count I moved), S3 "12 of 12" (was 11), X2 sums
grade_tiers=10, 17 checks/tenant all clean (T10 grade arms found 0 orphans; check count unchanged).
`prove_reconcile.py --from <fresh 0015 dump>` EXIT=0 TWICE (its RLS-disable injection fires the T10
grade arms). `prove_backup_restore.py` EXIT=0 TWICE (manifest/restore carry grade_tiers db=10 dump=10
restored=10). `seed_dev.py` runs clean on dev; `provision_shop.py` on a scratch yields one 'A' tier,
default_grade NULL.
**THE THREE PROOFS THIS CHANGE BROKE, fixed and GREEN TWICE.** `prove_seller_history.py`,
`prove_reports_summary.py` — each gained a grade_tiers seed in its fresh-tenant `seed_tenant`, before
the product_prices/sellers INSERTs; NO cell count moved. `prove_rls.py` — gained a grade_tiers seed
before its product_price, grade_tiers in ALL_TABLES (**9→10**) and `_TEARDOWN_ORDER`, and an OWNER
connection to delete the tier (F4 REVOKEs DELETE from the app role); teardown now removes **10**
rows/tenant (was 9), "nothing left in any of the 10 tables". `prove_seller_create.py` GREEN TWICE,
unchanged — the route-grade path into Shop A, confirming SAFE.
**NOT RUN, NAMED (argus-validated SAFE — its file:line survey correctly predicted the 3 breaks AND
prove_seller_create's safety, so its verdict on the rest is calibrated).** The remaining
grade/sellers/product_prices proofs seed grades ONLY into Shop A/B (tiers guaranteed by the backfill)
or via the unchanged Literal or seed no grade, so the re-point FK cannot fire; each needs infra not
stood up — a live :8099/:8000 API writing bills/master into dev (dev debris): prove_master,
prove_master_write, prove_master_data_gate, prove_seller_pricing, prove_daily_report, prove_revocation,
prove_bills, prove_year_gate; or a per-proof scratch: prove_seller_code_reservations,
prove_seller_code_guards, prove_docno_clock, prove_shop_settings. The higher not-additive bar is met
by a POSITIVE argument (the FK cannot fire) plus having run the representative direct-SQL and route
grade paths and both fresh-tenant paths, not by "infra".
**NOT OBSERVED / NOT BUILT in 1a:** the `/grade-tiers` routes, the deactivation refusal with its
count, seller/price/shop validation against a shop's own tiers, and `prove_grade_tiers.py` — all
commit 1b. No device work.
**IS A LESSON OWED? YES, WRITTEN.** `lessons/a-migration-reads-zero-under-force-rls.md`. The other
disciplines were already recorded and re-derived at the artefact: count from `pg_constraint` not the
log is `a-migration-stack-is-a-log-not-a-schema`; the 'A' placeholder not a Thai name is
`fallback-default-is-a-wrong-number`; the round-trip carrying a new relation is
`a-round-trip-must-agree-on-its-key-space`; the field-by-field schema-audit caught the apostrophe and
the guard bug before dev.

**P1.21 — SELLER HISTORY AT THE WEIGHBRIDGE, PHASE 2: the drawing on the phone. 2026-08-31.**
Committed at `0b2aee4` (anchored 2026-08-31 in the P1.24 commit-1a pass above). This WAS the
current-phase pointer until the P1.24 record above.
**BUILT HEADLESS and PROVEN; the on-device pass is UNOBSERVED (the owner's).** New pure builder
`mobile/src/sellerHistory/sellerHistoryView.ts` (behind `prove:sellerhistory`): the view model from
a `GET /sellers/{seller_id}/history` response — money rendered ONLY when the response's own
`money_included` is true (the phone NEVER infers it; `moneyVisible` is unreliable at the picker),
byte-for-byte, with summaryView's whole-response-refuse rule RE-STATED (a JSON number — a weight
always, a price/total when money is included — refuses the whole response with one calm sentence);
when money is hidden, ONE sentence naming เจ้าของร้าน as the decider (never `ขอสิทธิ์`, per B1); the
empty case its own calm sentence (`ยังไม่มีบิลก่อนหน้าของผู้ขายรายนี้ในระบบ`), never an error tone; a
voided bill marked `บิลที่ถูกยกเลิก`; a null `doc_no` shown as `ยังไม่มีเลขที่บิล`; dates in shop time
from the ONE offset (`@recycle/shop-time` `shopDate`) with the BE year AFTER conversion; ONLINE ONLY
(no local history store — a sync-engine change, out of bounds — so offline draws one calm sentence
and no rows); transport/timeout → unavailable + `ลองอีกครั้ง`, no red; a local/unsynced seller (404
`seller_not_found`) reads a calm "not on the system yet" message, distinct from a bare 404 (older
server). Thin `mobile/app/SellerHistorySheet.tsx` renders only what the builder returns (theme
tokens, `TAP_MIN` controls, no `<Modal>`, a `makeTone` factory). `app/api.ts` gains transport-only
`fetchSellerHistory` (the `fetchSummary` shape; no limit param → the server default 5).
**THE HOME IS THE CART'S SELLER HEADER, not the picker (M2).** The picker is a single-tap-commit
search list over many sellers, so a per-seller history there would fight the pick gesture or bloat
the 5am fast-pick screen; the header holds the ONE chosen seller for the draft's life with its id in
hand, and "what did this person sell before" is the natural follow-up to the pick — which is what
P1.21 asks for. A new sheet kind `seller_history` + one transition `open_seller_history` (`from:
[null]`, dispatched from a new `ดูประวัติ` control on the header); `EXPECTED_REACHABLE` 11→12, the
SET changed by exactly `{+seller_history}`.
**PROVEN (every command bare, exit read in the same invocation):** both typechecks green. The
"before" was NOT re-run and did not need to be — a state-mutating `git stash` to establish a PAST
fact is the wrong instrument: `git diff --stat 6117b67 HEAD -- mobile/ packages/` is EMPTY (exit 0),
so the committed mobile+packages tree is byte-identical to `6117b67`, where the item-3 records pin
both typechecks green, and that identical tree IS the pre-edit state my edits started from; the
"after" run here exits 0 for both `typecheck` and `typecheck:app`.
`prove:sellerhistory` (25 cells) exits 0 TWICE; FOUR disproofs each redden EXACTLY one cell and
revert — `money_when_hidden`→the money-absent cell, `empty_error`→the empty-sentence cell,
`date_utc`→the shop-date cell, `accept_number`→the refuse-whole-response cell; an unknown break exits
2. `prove:sheets` moved 11→12 (reachable set `{+seller_history}`; S9 scans 21 app files and finds one
`<Modal>`, S10 confirms `open_seller_history` is dispatched) and green TWICE. `prove:tapaudit` ZERO
findings over 21 files, green TWICE. Every OTHER headless mobile proof green TWICE with cell counts
UNMOVED from the item-3 baseline (proveSync 247, proveSignOut 151, proveNotice 81, proveDaily 104,
proveDashboard 49, proveOutbox 77, proveSellerKind 69, proveSellerStore 56, provePickerSeller 15,
proveReserveNotice 20, proveSettings 26, proveAccount 24, proveLocalSellerCreate 27, plus the rest);
the three live-server auth proofs (proveForbidden, proveLogin, proveLoginScreen) exit 1 ONLY for
`fetch failed` (no server). THE `api.ts`→BUILDER SEAM, over real HTTP on a fresh uvicorn on a free
port against a self-restored scratch (the app tree does not load under node, so the request shape
`api.ts` sends was MIRRORED and the response parsed by the REAL compiled
`dist/sellerHistory/sellerHistoryView.js`, the unit-3 precedent): admin → 200 `money_included:true`,
the builder renders 5 bills WITH prices and a shop-BE date (`13/03/2569`); staff with the toggle off
→ 200 `money_included:false`, the body carries NEITHER `total_amount` NOR `unit_price` and the
builder renders 5 bills with NO price and the calm note. Not a device pass.
**NOT OBSERVED — the handset half.** No device pass this session; its readings are ADDED to the ONE
consolidated handset list in the P1.23 item-3 phase-A record below (not a second list).
**IS A LESSON OWED? NO.** The disciplines are already recorded and were re-derived at the artefact:
money shown only on the response's own `money_included`, never inferred, is the
`cached-master-data-is-a-price-claim` / `a-value-comparison-cannot-prove-a-path` shape (trust the
authority, not a local guess); the JSON-number whole-response refuse is the money/decimal rule
re-stated (summaryView's own precedent); shop-date-before-BE is render-in-shop-time /
be-year-after-timezone; each disproof reddening exactly one cell through a wrapper (never a hook in
the module under test) is `a-check-that-never-went-red-was-never-observed`. No new class, no box trap.

**P1.21 — SELLER HISTORY AT THE WEIGHBRIDGE, PHASE 1: the reading endpoint. 2026-08-31.**
Committed at `c4e8b27` (anchored 2026-08-31 in the phase-2 pass above). This WAS the current-phase
pointer until the phase-2 record above; the P1.23 records below stand, the Phase-B one anchored to `6117b67`.
**BUILT (server, reading half) and PROVEN over real HTTP; no device work in this phase.**
New route `GET /sellers/{seller_id}/history` in `server/app/master.py` (where every `/sellers`
route lives): a seller's prior bills newest-first by `server_received_at`, LIMIT `limit`
(default 5, max 20 — a violation is a 422 on the `limit` field), each bill carrying `bill_id`,
`doc_no` (nullable), `server_received_at` and the shop-local `received_date` (ONE conversion
from `config.SHOP_TIMEZONE`, the BE year the phone's to derive AFTER it), `is_void` (derived
from `voided_at`; there is no `is_void` column), and a compact product list per bill —
`product_id`, `product_name` (LEFT JOIN `products`, no `is_active` predicate so a retired
product still resolves), `net_weight` (the weight `bills._line_amount` computed `amount` on).
MONEY per G2: `total_amount` (per bill) and `unit_price` (per line) are present ONLY for an
admin, or a staff caller when `tenants.staff_money_visible` is on; otherwise the KEYS ARE
ABSENT and `money_included` is false. `get_principal` (staff READ history — it is the
weighbridge's purpose; money is gated by absent keys, never a route refusal). Tenant isolation
is RLS (no hand-written `WHERE tenant_id`); an unknown or cross-tenant seller is 404
`seller_not_found` (RLS makes it invisible → `_read_seller` sees zero rows → `_not_found`), a
seller with no bills is 200 with `bills: []` and `seller_id` echoed — the two distinguished by
the existence check. One REPEATABLE READ snapshot; money and weight are decimal STRINGS
straight from the NUMERIC columns (the `bills._read_bill` serialisation). No migration, no new
column, no change to any existing route or constraint.
**PROVEN (every command bare, exit read in the same invocation):**
`scripts/prove_seller_history.py` exits 0 TWICE (each run re-restores its own scratch
`recycle_seller_history_scratch` from a live dump — dev read-only — provisions two fresh
throwaway tenants, and DELETES nothing; identity-gated on `/openapi.json` before any cell). Its
child uvicorn is spawned per run on a FREE port, started AFTER the edits, so it imports the
current code. Cells, operands printed: newest-first ordering; `limit` respected and its bound
refused (0/21/100 → 422 on `limit`); the voided bill present and marked; weights and (admin)
money byte-for-byte as strings; the midnight-straddle bill takes its SHOP day (2026-03-13), not
its UTC day (2026-03-12); the zero-bill seller → 200 empty with `seller_id` echoed and
`money_included` consistent; the unknown seller → 404 `seller_not_found`; another tenant's
seller → 404 (RLS layer), with the OTHER admin seeing it as the positive control; staff with
the toggle OFF → 200 (NOT 403) and the serialised body carries NEITHER `total_amount` NOR
`unit_price`, with the admin body as the presence-control sibling; admin PATCH the toggle on →
the staff body EQUALS the admin body byte-for-byte (money on ALL of the seller's bills, no
`created_by = self` scope); the toggle reverted to false in-run and RE-READ false. FOUR
disproofs on the route source, each named before it ran, each reddening ONLY its cell(s) and
reverted: (a) drop the money gate → the S-OFF absent-keys cell; (b) drop the void flag → the
void-marked cells (C, D-h3); (c) order oldest-first → the ordering cells (A, B-newest); (d)
drop the existence check → the unknown/cross-tenant 404 cells (G, H) while the zero-bill cell
(F) stayed GREEN, so the check is exactly what distinguishes 404 from 200-empty. `reconcile.py`
on dev = exit 0, 0 violations, 13 tables (no schema change). The 15 sibling proofs matching
`rg -l "sellers|/reports|FROM purchase_bills" server/scripts/` were NOT re-run: the change is
purely additive, the two `/openapi.json` identity gates among them assert path MEMBERSHIP not
an exact count (read at their `len(paths)` sites), and the full app imports cleanly (this
phase's own child uvicorn served every router), so none can break on it; each also carries
setup that would write dev debris or need infrastructure for zero expected signal — the
unit-2 precedent, "a green not run today is not written as green". NAMED, grouped by that
setup: EXTERNAL-SERVER (a live server writing bills or master data into dev) — `prove_daily_report`,
`prove_revocation`, `prove_master_write`, `prove_master_data_gate`, `prove_seller_pricing`,
`prove_master`; SCRATCH + its own server process — `prove_reports_summary`, `prove_seller_create`,
`prove_seller_code_reservations`, `prove_year_gate`; SCRATCH + a git worktree —
`prove_seller_code_guards`; SCRATCH/BACKUP, offline — `prove_reconcile`, `prove_docno_clock`,
`prove_backup_restore`; and the offline throwaway-tenant RLS proof — `prove_rls`. Fifteen in all.
**NOT OBSERVED — the drawing half (Phase 2 of this session) and any device work.** Phase 1 is
server-only and draws nothing on a handset. G2 is the ADVISOR'S READING (money for admin OR any
staff with the toggle on, across ALL the seller's bills), reported for the owner to overrule;
it is BROADER than E1's own-bills scoping on the aggregate summary route (a per-seller listing
is not a shop-wide aggregate) — flagged for the owner, built to as the brief directs.
**FUTURE VOLUME (recorded, not fixed):** the history query `EXPLAIN`s to a `Seq Scan on
purchase_bills` filtered on `seller_id`/`tenant_id` (and a seq scan on `purchase_bill_items`) —
no index serves `seller_id`; fine at one shop's volume, a P2.4 sibling of the daily/summary
notes, in OPEN_ITEMS. No cursor and no date range in v1 — a choice, also in OPEN_ITEMS.
**IS A LESSON OWED? NO.** The disciplines this phase leaned on are already recorded and were
re-derived at the artefact: the money keys ABSENT rather than zero is
`fallback-default-is-a-wrong-number`; the 404-not-403 for a cross-tenant id is
`403-is-about-what-the-caller-may-do` with the RLS-invisibility layer; the shop-day-from-one-
offset is the render-in-shop-time / be-year-after-timezone pair; the negative money cell with a
presence sibling is `a-check-that-never-went-red-was-never-observed`. No new class, no
box-specific trap.

**P1.23 item 3 — PHASE B: ONE VOCABULARY. 2026-08-31.** Committed at `6117b67` (anchored
2026-08-31 in this P1.21 pass). This WAS the current-phase pointer until the P1.21 record
above; the Phase-A record below is anchored to `8c2116d`.
**SETTLED and SWEPT; proven headless.** The owner settled the disputed-terms table (STOP B-1,
2026-08-31; recorded as HIS decisions). One term per concept now, across the `src/` wording
modules, the `app/` screens and the proof expectations — presentation strings only, no logic
(the Phase-B carve-out in OUT OF BOUNDS). The changes, old → new:
- `เซสชันหมดอายุ` → `หมดเวลาเข้าใช้งาน` (priceEdit)
- `ยังไม่มีเกรด` / `ยังไม่ได้กำหนดเกรด` → `ยังไม่ได้จัดเกรด` (shopSettings ×3, saveConfirmNotice,
  parkedReason); the compact `ไม่มีเกรด` beside `เกรด A` KEPT (SellerPicker, ConfirmSellerChange)
- `ตั้งเกรด` → `กำหนดเกรด` (shopSettings)
- `ส่งขึ้นระบบ` / `ส่งถึงระบบ` → `ส่งเข้าระบบ` (dailyView ×4, localSellerCreateNotice)
- `ค้างส่ง` / `ยังไม่ได้ส่ง` / `รอส่งขึ้นระบบ` / the unsent `เก็บไว้ในเครื่อง` → `รอส่ง` (unsentLine,
  statusNotice ×2, signOutNotice ×2); the cached-data and draft-saved `เก็บไว้ในเครื่อง`
  (freshness, parkedReason) are DIFFERENT concepts, KEPT
- `ส่งขึ้นระบบครบแล้ว` → `ส่งครบแล้ว` (signOutNotice); `ส่งแล้ว` the single-bill state KEPT
- `บิลที่ยกเลิก` → `บิลที่ถูกยกเลิก` (summaryView)
- `ยังไม่มีเลขที่` → `ยังไม่มีเลขที่บิล` (App.tsx)
- `ลองใหม่` → `ลองอีกครั้ง` (shopCode ×2, signInIdentity, freshness, parkedReason);
  `ลองพิมพ์ใหม่อีกครั้ง` → `ลองพิมพ์อีกครั้ง` (signInIdentity)
- `ราคาตามรายการ` → `ราคาประกาศ` (dailyView ×5) — the owner's OVERRIDE: the posted price is the
  accountancy-precise term
- B1 permission audit: the settings readonly note's `ผู้ดูแลระบบ` → `เจ้าของร้าน` (who-to-ask);
  every other refusal already conformed (FORBIDDEN_LINE, parkedReason, statusNotice, summaryView;
  roleLabel's role label untouched)
- `เคาน์เตอร์` → `สำนักงาน` (reserveNotice); `ใบเสร็จ` → `บิล` (shopSettings)
Proof expectations moved with each: proveDaily, proveSignOut, proveOwedSurfaces, proveDashboard,
proveNotice, proveLocalSellerCreate, proveCacheTenant. Server-owned Thai (the 424 message bodies in
proveSeller, `consequence_th` in proveDaily) and the negative-control literals (proveSaveConfirm's
`OLD_PARK` at :106, proveSeller's `SHIPPED_BEFORE` at :709) were UNTOUCHED.
**PROVEN:** both typechecks green before/after; every headless mobile proof green TWICE with cell
counts UNMOVED (proveSync 247, proveSignOut 151, proveNotice 81, proveDaily 104, proveDashboard 49,
proveLocalSellerCreate 27, proveSheets 11 stacks, plus the rest — wording moves expectations, not
counts); the harvest re-run (rg over every old term) shows ONE term per concept, only the 5 deliberate
keeps remaining; the negative cells still redden under their breaks (proveDashboard `add_unsent`,
proveLocalSellerCreate `leak`, proveSettings `echo_request`, proveAccount `echo422` each exit 1; the
proveSaveConfirm/proveSeller controls fire green).
**KEPT SEPARATE (the owner's rulings, not drift):** the weigher/staff role (`พนักงาน`) vs the by-user
dimension (`ตามผู้บันทึก`) vs the void actor (`ผู้ทำรายการ`); the per-bill grade price (`ราคาตามเกรด`,
`ราคาตั้งต้น`); the action-specific dismiss/confirm/save labels; the money words. Nothing was
deferred, so no OPEN_ITEMS line is owed.
**HANDSET PASS unchanged:** the consolidated list in the Phase-A record below stands as the ONE owed
device pass; the vocabulary is headless-provable, and the only device-visible residue is that the new
words render (part of that same both-themes / every-screen pass).
**P1.23's DONE WHEN — MET HEADLESS at this commit (items 1–4); OBSERVED ON A HANDSET: owed.** The
three defects are fixed (1), the P1.8b seller surfaces drawn (2), the consistency pass complete —
`TAP_MIN`, one presentation layer, one vocabulary (3, closed) — the dashboard and settings drawn (4).
But the bar's OWN words — legible in sun, wet-hand targets — are HANDSET observations, and every
screen here has been seen only by a proof, so the step is met ON PAPER; the consolidated device pass
above (units 1, 3, Phase A and this phase: both themes, follow-system, `TAP_MIN` on every control, the
13px floor at arm's length in sun) is the owed observation. **P1.23 closing does NOT close Band 1:**
S23's bar — a commercial-grade general app: store compliance, a release build, hosting — is wider than
P1.23's four items, which live in their own ROADMAP entries.
**IS A LESSON OWED? NO.** The sweep is the a-quantified-sentence-names-no-member discipline applied
deliberately (sweep by the term, keep the deliberate distinctions, keep the negative-control literals)
— already recorded. The hazard it re-touched — a proof cell can be a server-body fixture or a negative
control rather than an expectation — is already in
`lessons/a-check-that-never-went-red-was-never-observed.md` and
`lessons/a-proof-fixture-must-be-a-row-the-product-could-produce.md`; re-derived at each proof site,
not a new class.

**P1.23 item 3 — PHASE A: THE SHARED PRESENTATION LAYER, THE THEME, THE TAP SWEEP.
2026-08-30.** Committed at `8c2116d` (anchored 2026-08-31 in the Phase-B pass). This WAS the
current-phase pointer until Phase B above; the unit-3 record below stands, anchored to `6f90971`.
**BUILT and PROVEN headless; the on-device pass is UNOBSERVED (the owner's, and it is
LARGER this pass — a whole theme).** New pure module `mobile/src/ui/theme.ts`: the token
set for BOTH themes — colours (text, mutedText, textSubtle, placeholder, background,
surface, border, primary, danger/warning/success and the notice-tint families the
screens' tone maps resolve to, plus an overlay and a status-bar style), an 8-step type
scale (`body 13 · bodyLg 15 · subhead 17 · title 20 · titleLg 24 · headline 28 · display
32 · hero 44`, `body` the named floor), a spacing scale, radii, and ONE `TAP_MIN = 56`
carrying its recorded reason (the owner's B1 wet-hand-target bar) — and
`resolveTheme(pref, systemScheme)`. `mobile/src/ui/tapAudit.ts` is a pure text scanner
for tap-floor literals. `mobile/app/theme.tsx` is the React-Native glue
(`ThemeProvider`/`useTheme`/`useThemeControl`) reading the OS scheme (`useColorScheme`)
and the device-stored preference (one SecureStore key `recycle.pref.theme` ∈
{light,dark,system}, default follow-system, never the server — no new dependency, no
migration). All 18 screen `StyleSheet`s (`App.tsx` + 17 under `app/`) were swept onto the
tokens via a `makeStyles(t)` factory read through `useMemo`; the ~10 per-screen
tone→colour `Record` maps became `makeTones(t)` factories that keep each tone→family
mapping and read the colours from the theme; the six duplicated `const TAP_MIN` and
Numpad's `const KEY_H` are deleted. The settings screen gains the theme control (three
chips, device-stored, applied through the context, shown to staff and admin with a note
that it is NOT a shop setting). Two MEASURED legibility fixes rode the sweep: the
placeholder grey (`#94a3b8`, 2.6:1 on white) darkened to `#64748b` (4.76:1), and the
account notice badge (`#0891b2`, white at 3.68:1) darkened to `#0e7490` (5.36:1). The
type scale raised 33 sub-floor labels (10/11/12px) to the 13px body floor and normalised
103 of 211 font sizes to a rung (by value: 12→body ×27, 14→bodyLg ×24, 16→subhead ×20,
18→subhead ×11, 22→titleLg ×8, 26→headline ×4, 30→display ×2, 34→display ×1, 10/11→body
×6; the full per-site list rode this phase's artefacts); ZERO text sits below the 13px
floor. `app.json`'s `userInterfaceStyle` moved `light` → `automatic`.
**PROVEN (headless, every command bare, exit read in the same invocation):**
`prove:theme` (39 cells) exits 0 TWICE, printing every (text,bg) contrast ratio per
theme; THREE disproofs each redden EXACTLY their named cell (`--break=contrast` the
danger-tint pair, `--break=tapmin` the TAP_MIN cell, `--break=floor` the body-floor cell)
and an unknown break exits 2 with no banner. `prove:tapaudit` exits 0 TWICE — ZERO raw
`minHeight`/`minWidth` and ZERO local tap constant over all 20 screen files — with a
corpus-read control, two planted-literal positive controls, and a `--break=inject`
disproof (exit 1). Both typechecks green before and after. Every OTHER headless mobile
proof green TWICE with counts UNMOVED (proveSync 247, proveOutbox 77, proveSellerKind 69,
proveSellerStore 56, provePickerSeller 15, proveReserveNotice 20, proveLocalSellerCreate
27, proveSignOut 151, proveNotice 81, proveSettings 26, proveAccount 24, proveDashboard
49, proveDaily 104, proveSheets 11 stacks, plus ~25 more); the three live-server auth
proofs (proveForbidden, proveLogin, proveLoginScreen) were NOT run (no server) and exit 1
only for `fetch failed`. Scoping (P-A6): `git diff` over
`src/master|settings|dashboard|reports|sync|local|session|cart|money|time|adapters|device`
is EMPTY — the change touched only `app/`, `App.tsx`, `app.json`, `package.json`, and the
two new files under `src/ui`/`src/proof`. The inventory re-run finds ZERO raw hex, ZERO
rgba and ZERO raw `fontSize` literal in `app/`.
**NOT OBSERVED — the handset pass, now the ONE consolidated pass owed for units 1, 3,
this phase, P1.21's drawing half, the P1.24 grade model, AND the P1.23 item 3 phase-C visual pass
(each session added as the last bullet, not a second list).** No device pass this session;
follow-system, light rendering and cold-start persistence are device-visible and no headless proof
can see them — dark rendering alone is now OBSERVED (V1, 2026-08-31, in phase C's bullet below). On a handset (`npx expo start -c` + a
full reload FIRST — `CLAUDE.md § Boot check` "WHICH BUNDLE"), the owner reads:
- THIS PHASE (theme + sweep): every screen the sweep touched renders correctly in BOTH
  light and dark; the theme control on ตั้งค่าร้าน switches light / dark / follow-system
  and the choice SURVIVES a cold start; a phone whose OS is set to dark opens the app dark
  with NO choice made (follow-system + `app.json` automatic); a wet finger lands inside
  every control the sweep touched (all now ≥ `TAP_MIN`); and the smallest body text (13px)
  is legible held at arm's length in sun.
- UNIT 3 (dashboard, still unobserved): the `api.ts`→`summaryView` seam renders SERVER
  data at all; an ADMIN opens ยอดวันนี้ → the dashboard on today with totals, dimension
  bars, the per-bill list and the ค้างส่งจากเครื่องนี้ line while a bill is queued (the
  total above NOT moving); เดือนนี้ shows aggregates only; a STAFF session with the toggle
  off has NO ยอดวันนี้ entry; the owner turns the toggle on in ตั้งค่าร้าน and the staff
  session then opens ยอดของฉัน with their OWN totals and the one sentence that the per-bill
  list is not available for a staff account.
- UNIT 1 (settings/account, still unobserved): a STAFF session opens ตั้งค่าร้าน and sees
  the values with NO save control; an ADMIN edits address/phone and the default grade (a
  grade change asks a confirmation) and saves; บัญชีของฉัน shows the profile, and a password
  change with a pending bill queued produces the "changed — sign in again, work kept" sheet
  and lands on the login screen.
- P1.21 (seller history, the DRAWING HALF — this session): the ดูประวัติ control on the cart's
  seller header opens the history panel for the chosen seller, and it shows the seller's last
  loads; a STAFF session with `staff_money_visible` off sees NO price and one calm sentence naming
  เจ้าของร้าน; an ADMIN sees the prices; a seller with NO history reads calmly (its own sentence,
  not an error tone); a local/unsynced seller reads the "not on the system yet" message; and
  offline shows one calm sentence with no rows.
- P1.24 (the per-tenant grade model — Phase 2 AND commit 3, this session): on ตั้งค่าร้าน the
  owner sees the shop's tiers, ADDS one, RENAMES one, DEACTIVATES one (the refusal names the
  seller count when sellers sit in it, and refuses the LAST active tier), REACTIVATES it, and
  MOVES a tier UP / DOWN (↑ / ↓) with the new order surviving a reopen (commit 3); the
  default-grade control shows the shop's tier NAMES and is HIDDEN when the shop has one active
  tier (F2); a long Thai tier name shows in FULL on the price screen (the fixed grade column, not
  the old one-glyph width); and the seller picker / cart / confirm surfaces show a seller's grade
  by its NAME. A wet finger lands inside the ↑ / ↓ / แก้ชื่อ / ปิดใช้งาน controls (all ≥ `TAP_MIN`).
- P1.23 ITEM 3 PHASE C (the visual pass — this session): the owner re-reads the MAIN screen against
  his reference application and judges it — the notices no longer stack as four equal bars (the one
  notice that blocks work stays inline, the rest sit behind a count that opens a bottom sheet), the
  header does not collide (a fixed top bar with the wordmark and a separated ออกจากระบบ over a
  horizontal scroll nav row, the last chip no longer clipped at the frame), the accent appears RARELY
  (neutral nav chips, a subdued sign-out, teal only on the primary action and the selected theme
  segment), content sits on inset cards with one outer margin and one gap, the theme control is a
  segmented control, and the API address is GONE from the main screen (moved to the settings
  diagnostics). DARK rendering is OBSERVED (V1, 2026-08-31, the owner); light, follow-system and
  cold-start persistence remain UNOBSERVED.
- P1.23 ITEM 3 PHASE D (the reference-pinned bodies — this session): the owner re-reads the CART,
  ตั้งค่าร้าน, the DASHBOARD and every list body against his AllTCAS reference, in BOTH themes —
  teal appears RARELY (only the primary action, the selected state and the ONE hero figure per
  screen; every money figure, bar fill and decorative border now neutral, incl. the cart total by
  weight+size); the grade-tier rows read as name·code with the reorder ↑ ↓ on the row and a ⋯ that
  opens a grab-handle bottom sheet holding แก้ชื่อ and ปิดใช้งาน (retire OFF the row); ออกจากระบบ and
  the tier ปิดใช้งาน read RED and legible in both themes; cards share one corner with real gaps; and
  no body still touches the frame. He confirms the ⋯ menu is legible-and-hittable at arm's length in
  sun (≥ TAP_MIN) and that the red destructive is unmistakable. All UNOBSERVED (no device pass this
  session).
All UNOBSERVED except dark rendering (V1, OBSERVED 2026-08-31 by the owner).
**IS A LESSON OWED? NO.** The brief flagged the text-scanner-as-proof shape as "a new
instrument here"; re-derived against the tree, it is NOT new — `proveSheets.ts` already
reads `app/` source off disk and scans it with the same controls (a corpus-read control, a
known-present positive control), and `proveTapAudit.ts` was built by copying that pattern.
The discipline a text scan needs (a positive control, so "found nothing" is not "read
nothing") is already carried by `lessons/a-check-that-never-went-red-was-never-observed.md`.
One doc-hygiene item was found and fixed in-pass (a `SellerPicker` comment still said
"48pt floor" after the sweep raised it to `TAP_MIN`); a stale comment is not a bug class, so
it is a fix, not a lesson (`CLAUDE.md § Workflow` "Only for what would cause a real bug").

**P1.23 item 4, unit 3 — THE DASHBOARD ON THE PHONE: one screen, period × dimension
over `GET /reports/summary`, the day's bill list absorbed as the today view,
role/toggle-gated. 2026-08-31.** Committed at `6f90971` (anchored 2026-08-30 in the
P1.23 item-3 phase-A pass). This WAS the current-phase pointer until item 3 phase A
above; the unit-2 record below stands, anchored to `46a18b4`.
**BUILT HEADLESS and PROVEN; the on-device pass is UNOBSERVED (the owner's).** New
pure-TS builders under `mobile/src/dashboard/` — `period.ts` (presets today/week/
month/custom → two shop-local wire dates from the ONE offset constant
`@recycle/shop-time` `SHOP_UTC_OFFSET_MINUTES`, `dailyView`'s; a too-long custom range
refused on the device with a sentence naming the route's 366-day bound, so the route's
422 is never provoked; BE labels derived AFTER the conversion), `summaryView.ts`
(parses `/reports/summary`, money BYTE-FOR-BYTE, refuses a JSON-number money field
whole — the identical `readMoney` rule as `dailyView.ts:197`, re-stated because that
copy is module-private and its file is out of bounds; rows sorted by `paid_total` desc
with `Decimal.comparedTo` never `Number`; top 10 + one `อื่นๆ` whose fields are the
Decimal sums of the rest and reconcile to the server totals string-for-string; bar
width a LAYOUT fraction — the only `number`, never rendered as text), `unsentLine.ts`
(E4: this device's own `pending`/`syncing` bills' `total_amount` Decimal-summed, one
line under the totals, NEVER added into any total; a null amount counted but named),
`dashboardView.ts` (the gate + shell: E1 title `ยอดร้าน`/`ยอดของฉัน` naming whose
money it is, E2 entry gate hiding the header entry from a definite `staff` while the
shop's `staff_money_visible` is off — failing OPEN on an unknown role like the other
gates, the today-view bill-list slot admin-only). Thin `app/DashboardScreen.tsx`
renders only what the builders return (bars from plain Views — E6, no chart library,
no native module, NO new dependency in `package.json`). `app/DailyScreen.tsx` DELETED,
its per-bill list extracted to `app/BillList.tsx` (S24 — the daily screen absorbed as
the today view; `dailyView.ts` and its proof UNTOUCHED). `app/api.ts` gains
transport-only `fetchSummary`. The sheet stack SWAPPED `daily` for `dashboard` (the
ยอดวันนี้ entry now opens the dashboard); the reachable set stays 11, changed by
exactly {−daily, +dashboard}. `staff_money_visible` is read once via the existing
`fetchShop` with a dashboard-owned one-field reader (`readMoneyVisible`), so
`shopSettings.ts` and `prove:settings` are untouched; offline it is null, which hides
the staff entry (treated as OFF), and the summary's own `staff_money_hidden` 403
corrects it so the entry drops next menu draw.
**PROVEN:** `npm run prove:dashboard` (49 cells) exits 0 TWICE with no reseed (pure,
constructed inputs, preset red); FIVE disproofs each redden EXACTLY their named cell
and revert — `staff_entry_off`→the E2 staff-off entry cell, `add_unsent`→the
E4 total-unchanged cell, `number_sort`→the Decimal-sort cell (a 1e17 pair a double
cannot tell apart), `utc_today`→the midnight-straddle cell, `accept_number`→the
refuse-whole-response cell; an unknown `--break` exits 2. `prove:sheets` moved 11→11
(daily removed, dashboard added) and stays green. `prove:daily` UNMOVED (104 cells;
`dailyView.ts`/`proveDaily.ts` untouched). Every other headless mobile proof green
TWICE with counts UNMOVED from the unit-1 baseline (proveSync 247, proveOutbox 77,
proveSellerKind 69, proveSellerStore 56, provePickerSeller 15, proveReserveNotice 20,
proveLocalSellerCreate 27, proveSignOut 151, proveNotice 81, proveSettings 26,
proveAccount 24). The three live-server auth proofs (proveForbidden, proveLogin,
proveLoginScreen) exit 1 ONLY for want of a live server. Both typechecks green before
and after. Real HTTP on a fresh uvicorn on a free port (identity-gated on
`/openapi.json`; start after the edit) against dev Shop A: admin `fetchSummary`
today/by=product/live → 200 and the REAL compiled `summaryView` ACCEPTS it; staff →
403 `staff_money_hidden` rendered as a calm forbidden message; admin
`patchShop {staff_money_visible:true}` → 200 → staff `fetchSummary by=user` → EXACTLY
one row keyed by their `user_id` (label `staff`); the toggle reverted to false in
`finally` and RE-READ false, restoring Shop A. Not a device pass. `app/api.ts` cannot
load under node (it imports `expo-constants` through `./config` and is never emitted
to `dist`), so the node runner MIRRORS api.ts's exact request shapes and parses with
the real compiled `dist/dashboard/summaryView.js` — the request construction and the
response parsing exercised against the real server. **So `app/api.ts`'s own
`fetchSummary`/`patchShop` were NOT exercised by P4, and the `api.ts`→`summaryView`
seam — whether the app's transport actually hands the real response to the parser —
is proven ONLY on the handset.**
**NOT OBSERVED — the handset half, for BOTH units.** No device pass this session. On a
handset (`npx expo start -c` + a full reload FIRST — `CLAUDE.md § Boot check` "WHICH
BUNDLE"), the owner must read, for UNIT 3: FIRST, that the dashboard renders SERVER
DATA AT ALL — the `api.ts`→`summaryView` seam the headless runs could not exercise
(the P4 note above); then an ADMIN opens ยอดวันนี้ → the dashboard on
today with the totals, the dimension bars, the per-bill list, and the ค้างส่งจากเครื่องนี้
line while a bill is queued (and the total above NOT moving); switching to เดือนนี้
shows aggregates only, no bill list; a STAFF session with the toggle off has NO
ยอดวันนี้ entry at all; the owner turns the toggle on in ตั้งค่าร้าน, and the staff
session then sees the entry, opens it to `ยอดของฉัน` with their OWN totals and one
sentence that the per-bill list is not available for a staff account in this version.
And for UNIT 1 (still UNOBSERVED, copied from its phase-2 record): a STAFF session opens
ตั้งค่าร้าน and sees the values with NO save control; an ADMIN edits address/phone and
the default grade (a grade change asks a confirmation) and saves; บัญชีของฉัน shows the
profile, and a password change with a pending bill queued produces the "changed — sign
in again, work kept" sheet and lands on the login screen. All UNOBSERVED.
**IS A LESSON OWED? NO.** Weighed both candidates the brief named. The bar width is a
LAYOUT number derived from a money string — but that is an APPLICATION of the existing
money discipline (money VALUES stay strings; a fraction is geometry, not money), stated
in `summaryView.ts` and asserted by `prove:dashboard` (every displayed money string is
the server string; the fraction is separate), not a new bug-class to relearn. The staff
bill-list gap (`/reports/daily` has no own-bills variant) is a DISCOVERY, recorded in
`OPEN_ITEMS.md` for the owner, not a lesson. Nothing new was relearned
(`CLAUDE.md § Workflow` "Two homes, one test").

**P1.23 item 4, unit 2 — THE DASHBOARD'S SERVER HALF: the period-summary route
and the staff-money-visibility setting. 2026-08-30.** Committed at `46a18b4`
(anchored 2026-08-31 in the unit-3 pass). This was the current-phase pointer until
unit 3 above; the unit-1 records below stand, anchored to `49f9fd2` (phase 1) and
`e69d417` (phase 2).
**BUILT and PROVEN over real HTTP.** Migration `0014_tenants_staff_money_visible.py`
adds `tenants.staff_money_visible` (boolean NOT NULL DEFAULT false — OFF is the
owner's only-safe initial state per D1, NOT a fallback default that could be a
wrong number); applied to dev `recycle` (`alembic current` = 0014, re-read from
`information_schema`: boolean, NOT NULL, default false). `server/app/master.py`
widens `GET /shop` (staff-readable) and `PATCH /shop` (admin-only) to carry
`staff_money_visible`; it is deliberately NOT in `_SHOP_NULLABLE`, so an explicit
null is a 422 (the flag is either on or off). `server/app/reports.py` adds ONE
route, `GET /reports/summary` — a period aggregated by {product, seller, user, day}
× state {live, void, all}, RLS-scoped (no hand-written tenant predicate, the file's
own pattern), ONE REPEATABLE READ snapshot, money and weight as decimal STRINGS.
Every figure NAMES its price basis (D2): `paid_total` is the unit_price sum (what
the shop PAID), `list_total` the list_price comparison, `list_minus_paid` =
list_total - paid_total their difference and NOT a classification of why they
differ. Staff see NO money unless the toggle is on (403 `staff_money_hidden`, which
names the shop owner as the decider); when on, a staff caller is FORCED to their own
bills (`created_by = self`), regardless of `by` — the ADVISOR'S READING of "when
ON", built to here and reported as such, the owner's to overrule. `/reports/daily`
and `mobile/app/DailyScreen.tsx` are untouched.
**PROVEN:** `scripts/prove_reports_summary.py` exits 0 TWICE with no reseed — its
own child uvicorn on a FREE port against a self-restored scratch database
(`recycle_summary_scratch`, the dev DB only READ; the scratch-database pattern the
brief preferred, per lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-
database.md), identity-gated on `/openapi.json`, TWO throwaway tenants provisioned
fresh, ABSOLUTE hand-computed Decimal sums compared byte-for-byte, and it DELETES
nothing. FOUR disproofs each reddened their named cell and reverted green: (a) drop
the staff `created_by = self` forcing → the staff-own-rows cells; (b) there is no
tenant predicate to drop, so isolation is proven held by FORCE RLS + SET LOCAL —
pointing the route at `tenant_connection(None)` fails CLOSED; (c) `list_total` on
`unit_price` → the `list_minus_paid` cells (diff → 0); (d) a UTC day bucket → the
midnight-pair cell (23:30/00:30 collapse). `scripts/prove_shop_settings.py` widened
(its E1 exact-key set and identity gate now include `staff_money_visible`) and green
TWICE; `reconcile.py` on dev = exit 0, 0 violations (a column, not a relation, so
`backup_db.py`'s manifest key space is unchanged).
**NOT RE-RUN THIS PASS — a green not run today is not written as green.** The change
is purely additive (a new NOT-NULL-with-default column and a new route; no existing
column, route or constraint moved), and no other proof asserts the exact `tenants`
column set, `/shop` key set, or reports-route set — only `count(*) FROM tenants`
row-counts, which an added column cannot move — so none can break on it; each also
carries setup that would write dev debris or need provisioning for zero expected
signal. The proofs `rg -l "/shop|/reports|FROM tenants|purchase_bill" server/scripts`
matched and this pass did NOT re-run, by setup: external-server (a live server on
`:8099`, writing bills into dev) — `prove_daily_report`, `prove_revocation`,
`prove_master_write`, `prove_master_data_gate`, `prove_seller_pricing`;
scratch/backup (`--database` + a restored copy) — `prove_reconcile`,
`prove_docno_clock`, `prove_backup_restore`, and `prove_year_gate` (external server
AND scratch); scratch with its own uvicorn — `prove_seller_code_reservations`,
`prove_shop_code`; scratch + a git worktree — `prove_seller_code_guards`; and the
offline throwaway-tenant RLS proof — `prove_rls`.
**NOT DONE / NOT OBSERVED:** the phone's dashboard (unit 3) is a SEPARATE step and
NO screen was drawn this pass. The `by=day` query `EXPLAIN`s to a sequential scan
over `purchase_bills` at fixture size — recorded in OPEN_ITEMS as a future-volume
line (P2.4), not an index built here. No device pass; this unit draws nothing on a
handset.

**P1.23 item 4, unit 1 — PHASE 2 (MOBILE): the shop-settings screen and the
account screen. 2026-08-30.** Committed at `e69d417` (anchored 2026-08-30 in the unit-2 pass).
This supersedes the PHASE 1 record below as the current-phase pointer; that record
stands and is anchored to `49f9fd2`.
**BUILT HEADLESS and PROVEN; the on-device pass is UNOBSERVED (the owner's).** New
pure-TS builders under `mobile/src/settings/` — `shopSettings.ts` (the GET/PATCH
`/shop` view-model, role-gated: staff READ-ONLY with no edit control drawn, admin
editable; refusals worded from the cause — the 403 names the shop owner and the
admin role, never a sign-in), `account.ts` (profile + own-password change, the
length bound and the mismatch checked on the device so the route's 422 is never
provoked, and the refusal body never rendered), and `roleLabel.ts` (the role's Thai
label, one place). Thin `app/SettingsScreen.tsx` / `app/AccountScreen.tsx` render
only what the builders return. The grade set is REUSED from `GRADES`
(`src/master/priceEdit.ts`) — NO sixth A-D copy was minted (0010 named five); the
view imports it, so S16/P1.24 edits one line. Settings is ONLINE-ONLY (not an
outbox kind): offline it draws no field and says a connection is needed. A save
re-renders from the PATCH RESPONSE (the witnessed state), never the request. A
password change REUSES the expired-session path (sets `sessionEnded`, keeps the
token and the queue — hard rule 8; the sign-out gate is not involved) and names the
kept work. Navigation: `settings`/`account` added to the sheet stack (still one
Modal host, no `visible=`); `app/api.ts` gains transport-only `fetchShop` /
`patchShop` / `changeOwnPassword` / `fetchWhoAmI`; `deviceRole.ts` gains
`mayEditShopSettings`.
**PROVEN:** `npm run prove:settings` (26 cells) and `npm run prove:account` (24
cells) exit 0 TWICE with no reseed (pure, constructed inputs); FOUR disproofs each
redden EXACTLY their named cell and revert — `staff_save`→the staff-negative cell,
`hardcode_grades`→options-equal-GRADES, `echo_request`→witnessed-state,
`echo422`→the no-echo cell. `prove:sheets` moved 9→11 reachable stacks (settings,
account) and stays green; every other headless mobile proof is green TWICE with
counts UNMOVED from the P1.8b baseline (proveSync 247, proveOutbox 77, proveSellerKind
69, proveSellerStore 56, provePickerSeller 15, proveReserveNotice 20,
proveLocalSellerCreate 27, proveSignOut 151, proveNotice 81). The three live-server
auth proofs (proveForbidden, proveLogin, proveLoginScreen) exit 1 ONLY for want of a
live server. Both typechecks green before and after. Real HTTP, one request each on
a fresh uvicorn (identity-gated on `/openapi.json`): `GET /shop` 200 (four fields),
admin `PATCH /shop` 200, and `POST /users/me/password` 200 on a THROWAWAY staff user
the runner creates and never on the owner's account — its old token then 401s,
confirming the session-end path against the real server; dev Shop A restored,
throwaway deactivated.
**NOT OBSERVED — the handset half.** No device pass was run this session. On a
handset (`npx expo start -c` + a full reload FIRST — the `CLAUDE.md § Boot check`
bundle rule), the owner must read: a STAFF session opens ตั้งค่าร้าน and sees the values
with NO save control; an ADMIN edits address/phone and the default grade (a grade
change asks a confirmation) and saves; บัญชีของฉัน shows the profile, and a password
change with a pending bill queued produces the "changed — sign in again, work kept"
sheet and lands on the login screen. All UNOBSERVED.

**P1.23 item 4, unit 1 — PHASE 1 (SERVER): the shop-settings server half.
2026-08-30.** Committed at `49f9fd2` (anchored 2026-08-30 in the phase-2 pass).
This was the current phase until PHASE 2 above; the maintenance pointer below (M0)
is superseded as the current-phase pointer only — that record stands.
**BUILT and PROVEN over real HTTP.** Migration `0013_tenants_address_phone.py`
adds `tenants.address` and `tenants.phone` — `text`, NULLABLE, no default, each
with a named `char_length` CHECK (500 / 32) matching the API `max_length`
exactly; applied to dev `recycle` (`alembic current` = 0013, re-read from
`information_schema`). `server/app/master.py` widens `GET /shop` (staff-readable)
and `PATCH /shop` (admin-only, PARTIAL — an absent field is untouched, an explicit
null clears) to carry `address` and `phone`; `name` stays NOT accepted (a `name`
key is a 422, immutable-by-decision per `9ad225e` — the owner settled READ-ONLY
where a phase brief had contradicted itself). `default_grade` handling,
`provision_shop.py`, `bills.py`, RLS and roles are untouched.
**PROVEN:** `scripts/prove_shop_settings.py` exits 0 TWICE with no reseed (its own
child uvicorn on a free port, identity-gated on `/openapi.json`; the Thai address
stored byte-for-byte, hex read from Postgres; the 422 does NOT echo `input` — the
API-wide validation-error handler redacts it, which CORRECTS the brief that
expected the echo); one disproof (drop `require_admin` on the PATCH) reddened
EXACTLY the staff-403 cell and reverted green. `reconcile.py` on live = exit 0 (no
new relation, so the backup manifest key space is unchanged). Every other proof
touching `/shop` or `tenants` — `prove_seller_code_guards`, `prove_shop_code`,
`prove_seller_code_reservations`, `prove_reconcile` — exits 0 TWICE.
`verify_shared_checks`, `build_all_lessons --check`, and the 14-source citation
checker (BROKEN held at the floor of 6, CITATIONS +3) are all green.
**NOT DONE / NOT OBSERVED:** Phase 2 (mobile) — the shop-settings screen and the
account screen — is a SEPARATE commit and is NOT built here. Its on-device pass is
the owner's and is UNOBSERVED.

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
  **SUPERSEDED 2026-08-29 (M6 c3): the bare "14 sources" here did not NAME its list,
  so the 8 is not reproducible.** The M6 c3 record below re-derives it over a named
  14-file list and reads 6 — not two healed breaks (no commit sits between) but a
  different list: `README.md` and `lessons/README.md` carry zero citations and each
  fires the non-empty control, so any 14 built from them reads higher. The floor is
  recorded by its FILES there, never again as a bare count.
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

**MAINTENANCE — M6: THE ROADMAP REALIGNMENT ON CLEAN GROUND, AND AN HONEST
VELOCITY. 2026-08-29.** The last maintenance phase — three documentation commits, no
code and no database. **c1** recorded three owner decisions of 2026-08-28/29 in
`ROADMAP.md § What the owner has settled` (S23, mobile's bar is a commercial-grade
general app; S24, the owner dashboard is the superset, absorbing DailyScreen; and a
D-C extension of S6, settings on both surfaces), swept the decision-audit
quantifiers to S24, and landed the Gemini-filter verdicts as a research note. **c2**
wrote `ROADMAP.md § The completion sequence to handover`, minted P1.24 for the grade
model, and carries this note. **c3** (2026-08-29) records two more owner decisions
that had reached no file for days — the domain is bought at the END, not early (an
extension to S13), and P1.1's schedule is the owner's and not currently taken up —
homed in `ROADMAP.md § What the owner has settled`,
`ROADMAP.md § The completion sequence to handover`,
`ROADMAP.md § P1.1 — The second-hand goods act's record-keeping obligation` and
`ROADMAP.md § P1.11 — An installable build on staff-owned phones`; it also names the
citation floor by its file list where c1's inherited figure did not, and queues one
line of code debt. The detail is the c3 block at the foot of this M6 record.

**THE VELOCITY, STATED AS WORK AND NOT AS TIME — no estimate is dressed as a fact
here.** Where the project stands, measured: the mobile program has the purchase
flow, offline seller creation (P1.8b — code complete, two device/server passes
owed) and P1.9 price editing; it is NOT finished to the S23 bar — P1.23's rework,
the S23/S24/D-C surfaces, P1.18's handset criterion, P1.21 and P1.11 are all live.
The desktop is one 0-byte file (`desktop/.gitkeep`); stage 3, the provider web, is
not started; the pilot (stage 2) is held shut by S7 until all three deliverables
exist. **The remaining shape is the four bands of
`ROADMAP.md § The completion sequence to handover`** — mobile to the S23 bar, then
the desktop back office, then the provider web, then the pilot — with hosting (P1.2)
and the legal answer (P1.1) able to start in parallel now.

**WHY NO DATE, AND IT IS A HONESTY POINT, NOT A HEDGE.** This file has been burned
by dated claims that outlived their own date: the `Last updated: 2026-08-06` header
above still sits over 2026-08-29 entries, and the M5 record names a correction
outlived by a commit on the same day it was written. A completion date computed from
step counts would be that same shape — a number true only at the instant of writing
and read later as a promise. The honest statement is the WORK: the four bands, the
steps still live in each, and the gates the sequence names as owned by no step yet
(a tenant-isolation/RLS audit, monitoring, PDPA/store-compliance, a support channel)
— how much is unbuilt, not when it lands. **IS A LESSON OWED (M6)? NO, by
`CLAUDE.md § Workflow` "Two homes, one test".** The one non-obvious finding — that
the accepted completion spine violated S7/S8/S13 and its order had to be corrected —
is `CLAUDE.md § Workflow` "A REPORT IS A CLUE" applied (an external proposal
re-derived against the file's own chains, not obeyed); the citation that wrapped
across two lines while drafting was the pin-a-claim rule and was caught by the
checker before it landed. Nothing new to relearn.

**M6 c3 — TWO OWNER DECISIONS THAT LIVED IN NO FILE, AND A CITATION FLOOR NAMED BY
ITS LIST. 2026-08-29.** Documentation only; files ROADMAP.md, PROJECT_STATUS.md,
OPEN_ITEMS.md; no code, no database.

- **The two decisions, recorded in `ROADMAP.md` with their reasoning.** (1) The
  domain is bought at the END, when the app, desktop and web are all finished — an
  extension to S13 that bounds its timing and mints no S-number, with S13's "worth
  buying early" paragraph superseded in place and the owner's words kept verbatim.
  Measured consequence: a tunnel meets P1.2's `https://` and off-box-backup halves
  with no name, so P1.2 is NOT blocked; what the domain gates is P1.11, because
  `mobile/app.json` bakes `apiBaseUrl` (today the LAN `http://192.168.1.238:8000`,
  single reader `mobile/app/config.ts:24`) into the build. (2) P1.1's placement
  argument — D10 irreversibility — is unchanged, but its schedule is the owner's and
  as of 2026-08-29 not taken up, so it is no longer presented as "start now". Both
  were settled in conversation (2026-08-26, reaffirmed 2026-08-28) and reached a file
  only now, the failure `research/master-plan-2026-08-26.md` § 8 names.
- **The absence was MEASURED before it was written, with a control.** A search of
  ROADMAP/PROJECT_STATUS/OPEN_ITEMS for the domain PURCHASE TIMING (`ผมจะซื้อ`,
  `ซื้อ domain`, `buy the domain`, domain-near-handover) returned nothing; the control
  `buying early`/`S13` returned 12 hits, so the instrument looked and the decision
  was absent. The quoted Thai was verified in bytes, not by console — one occurrence,
  codepoints and UTF-8 bytes equal to the value fixed before the write, with an ASCII
  control down the same path (`console-is-not-the-observation`).
- **The citation floor, NAMED BY ITS FILES.** Re-derived at `ffbed78` (clean tree,
  before c3's edits), call operator, `SOURCES=` read first, over 14 files — the twelve
  root `.md` that carry citations (ADVISOR, ADVISOR_CHAT_INSTRUCTIONS, ARCHITECTURE,
  BRIEFING, CLAUDE, EVIDENCE, OPEN_ITEMS, PROJECT_STATUS, RED_TEAM, ROADMAP, SRS_MAP,
  START_HERE) plus `.claude/agents/metis.md` and `.claude/agents/nemesis.md` —
  `BROKEN=6`: OPEN_ITEMS ×4, SRS_MAP ×1, nemesis ×1, all REAL broken citations, zero
  control failures. The M1 record above read 8 over an UNNAMED 14; the gap is the
  list, not two healed breaks — no commit sits between, and `README.md` and
  `lessons/README.md` each carry zero citations and fire the non-empty control, so any
  14 including them reads +1 each. This is OPEN_ITEMS' own warning — which number is
  correct depends entirely on the source list, read `SOURCES=` first — and the fix it
  asks for, naming the list, is done here.
- **c3's own edit adds ZERO NEW BREAKS.** ROADMAP as a source went 192 → 199
  citations, `BROKEN=0`; the seven new ROADMAP citations each resolve to exactly one
  target, line numbers read. Re-run after the PROJECT_STATUS and OPEN_ITEMS edits, the
  named 14-list holds at `BROKEN=6`. `verify_shared_checks.py` IDENTICAL exit 0;
  `build_all_lessons.py --check` exit 0; the code trees (mobile/server/packages/
  desktop/tools) `git status --porcelain` empty, so both mobile typechecks are
  unaffected.
- **One line of code debt queued, not fixed** — `mobile/app.json`'s `apiBaseUrl`
  comment names `device/src/config.ts`, a path that does not exist; the real and only
  reader is `mobile/app/config.ts`. Recorded at
  `OPEN_ITEMS.md § Code debt found and left in place`, because it misdirects the next
  reader of the one string the domain decision now gates.
- **IS A LESSON OWED (M6 c3)? NO, by `CLAUDE.md § Workflow` "Two homes, one test".**
  Recording decisions that lived nowhere is the failure `research/master-plan-2026-08-26.md`
  § 8 already names; naming the citation floor by its list rather than a bare count is
  the pin-a-claim convention and OPEN_ITEMS' own source-list warning; the stale comment
  is code debt. Nothing new to relearn, and no box-specific trap.

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

**Superseded 2026-08-30 (`49f9fd2`): "further down this file"
is now WRONG.** The P1.8b GATES record was moved to the cold archive at `f7ab2e0`
(2026-08-28) and now lives in `archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md`;
`rg -n GATES PROJECT_STATUS.md` returns only this c4 pointer, so the quoted handle
resolves in the archive, not here.

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

**MEASURED 2026-09-02 AT `98cbc2d` — THE THREE INVENTORIES BELOW ARE THE 2026-07/08
PICTURE, AND MOST OF THEIR FACTS HAVE GONE STALE. READ THIS TABLE FOR WHAT EXISTS;
READ THE BULLETS FOR WHAT WAS TRUE WHEN THEY WERE WRITTEN.** Every claim in the
section was re-derived against the tree, one command each; the bullets are left
unedited by this repository's rule (supersede, never delete) and each stale bullet
now ends in a one-line pointer back to this table. Why a table and not corrected
sentences: the advising chat reads this section to learn what exists and has repeated
its stale values to the owner more than once, and a sentence re-remembered is how they
got stale. Treat the TABLE, not any count in this paragraph, as the authority on how
many claims moved.

| claim as written below | true value at `98cbc2d` | command (repo root, Bash tool) |
|---|---|---|
| migrations `0001`–`0005` | **16**: `0001_initial_schema.py` … `0016_failed_login_attempts.py` | `m=(server/migrations/versions/0*.py); echo ${#m[@]}` |
| nine tables named (and `doc_no_counters`, 0002, was absent even then) | **14 business tables** in `public` plus `directory.shop_codes` (0009) outside it: the nine, `doc_no_counters` (0002), `server_clock_watermark` (0008), `seller_code_reservations` (0012), `grade_tiers` (0015), `failed_login_attempts` (0016) | `grep -n "CREATE TABLE\|DROP TABLE" server/migrations/versions/0*.py` — 15 CREATEs; every DROP sits in a `downgrade()`, so none reaches head |
| `product_prices` (grade A–D) | the A–D CHECK is **DROPPED** (0015:311); `grade` is a composite FK to `grade_tiers (tenant_id, code)`, a per-tenant set | `grep -n "DROP CONSTRAINT product_prices_grade_check" server/migrations/versions/0015_tenant_grade_tiers.py` |
| "The four master-data tables carry `is_active` (0004)" | **SIX** tables carry it: the four (0004:71), `users` (0007:173), `grade_tiers` (0015:218) | `grep -n "is_active boolean" server/migrations/versions/0*.py` |
| no authentication: `GET /health` (`main.py:105`), `POST /auth/login` (`main.py:119`) | **THREE** routes, and both positions moved: `GET /health` `main.py:255`, `POST /auth/login` `main.py:269`, `POST /auth/shop-code` `directory.py:87` | a Python script pairing every `@router.`/`@app.` decorator in `server/app/*.py` with the first `Depends(...)` in its signature; the one signature longer than the script's window (`GET /reports/summary`) read by hand at `reports.py:886` |
| any signed-in user: eight routes listed | **FIFTEEN**: the eight, plus `GET /sellers/{seller_id}/history`, `POST /sellers` (staff create sellers), `GET /grade-tiers`, `POST /seller-code-reservations`, `GET /shop`, `GET /reports/summary` (money gated inside the handler), `POST /users/me/password` | the same script |
| admin only: the list ending `POST /users/{user_id}/revoke-sessions` (`users.py:56`) | **TWENTY-NINE**: the written list minus `POST /sellers` (now staff), plus `POST /grade-tiers`, `PATCH /grade-tiers/{id}`, `PUT /grade-tiers/order`, `PATCH /shop`, `GET /users`, `POST /users`, `POST /users/{id}/deactivate`, `/activate`, `/unlock-login`, `POST /users/{id}/password`; revoke-sessions is at `users.py:522` | the same script; 3 + 15 + 29 = 47 decorators |
| "because `users` has no `is_active` column" | **FALSE since 0007** (`0007_users_is_active.py:173`): an account CAN be locked, `POST /users/{id}/deactivate` at `users.py:600`, and the module docstring at `users.py:50-62` no longer calls revoke-sessions a stopgap for that reason | `grep -n "ADD COLUMN is_active" server/migrations/versions/0007_users_is_active.py` |
| reconcile: 17 checks per tenant plus 10 global | **UNCHANGED**: T0–T16 = 17; S1–S5, B1–B2, X1–X3 = 10 | Python `re.findall(r'"([TSBX]\d+)"', src)` over `server/scripts/reconcile.py`, deduplicated |
| proofs: THIRTEEN scripts, listed by name | **27** `prove_*.py` files | `p=(server/scripts/prove_*.py); echo ${#p[@]}` |
| two proofs need a scratch copy and refuse the live database | **15** files carry a live-database refusal string (a string in source is a declared intent, not a refusal observed) | `grep -il "REFUSES TO RUN AGAINST THE LIVE\|equals the live database\|is the LIVE database\|NEVER AGAINST dev\|SCRATCH ONLY\|REFUSES to run against the database named" server/scripts/prove_*.py` |
| seed: an `admin` AND a `staff` user per tenant | UNCHANGED | `grep -n '"role"' server/app/seeddata.py` — `:110`, `:112`, `:125`, `:127` |
| backup: three files, `--overwrite-live` | UNCHANGED and now INCOMPLETE: `safety_net_backup.py`, `safety_net_common.py`, `verify_backup.py`, `check_backup_freshness.py` landed 2026-09-02 (see § Current phase) | `ls server/scripts/safety_net_*.py server/scripts/verify_backup.py server/scripts/check_backup_freshness.py` |
| Postgres 16, `recycle_pg`, host port 5544 | UNCHANGED | `grep -n "image:\|5544\|container_name" server/docker-compose.yml` |
| mobile: "per-record pending / synced / failed" | **FOUR** states: `"pending" \| "syncing" \| "synced" \| "failed"` | `sed -n '16p' mobile/src/sync/types.ts` |
| mobile: a "three-way" classification of send failures | `SendOutcome` has **EIGHT** members: two successes (`accepted`, `duplicate`) and six others (`rejected`, `rejected_resolvable`, `session_expired`, `forbidden`, `client_outdated`, `unavailable`) | `grep -o 'kind: "[a-z_]*"'` over `mobile/src/sync/types.ts` lines 302–404 |
| storage: bills store, draft store, master-data cache, driver, mutex, schema | **ELEVEN** files: those plus `SqliteIdentityStore`, `SqliteShopStore`, `SqliteDeviceStore`, `SqliteLocalSellerStore`, `nodeDriver` | `a=(mobile/src/adapters/sqlite/*.ts); echo ${#a[@]}` |
| screens: cart, picker, master strip, status strip, bills panel, sign-out sheet | **28** `.tsx` files under `mobile/app/`, including login, dashboard, prices, settings, grade tiers, users, account, seller history and add-seller | `s=(mobile/app/*.tsx); echo ${#s[@]}` |
| proofs: FOURTEEN headless `npm run prove:*` scripts | **47** | `node -e` over `mobile/package.json` `scripts`, keys with the `prove:` prefix |
| "`prove:forbidden` is the first mobile proof that REQUIRES the live API" | **FOUR** require it: `proveForbidden`, `proveLogin`, `proveLoginScreen`, `proveUsers` | `grep -l "RECYCLE_API_BASE" mobile/src/proof/*.ts` |
| desktop: "Empty but for `.gitkeep`" | UNCHANGED | `git ls-files desktop` |

**THIS SECTION HAS CROSSED THE LINE WHERE SUPERSEDING IN PLACE STOPS WORKING.** Its
first bullet's first sentence is false, and a reader meets the correction only at that
bullet's end or in the table above; the mobile subsection already carried two
struck-and-reinstated paragraphs before this pass. The same shape is recorded for
`ARCHITECTURE.md § 4. The data model`, where "ten tables" is followed by three dated
corrections. What should happen to this section is PROPOSED, not done, at
`OPEN_ITEMS.md § Documentation` "THE WHAT-IS-BUILT SECTION IS SUPERSEDED PAST READABILITY".

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
  **Superseded 2026-09-02 — see the table at the head of this section:** 16
  migrations, 14 business tables, the A–D CHECK dropped by 0015, six tables carrying
  `is_active`.
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
  **Superseded 2026-09-02 — see the table at the head of this section:** 3
  unauthenticated, 15 signed-in and 29 admin-only routes; `POST /sellers` is
  staff-reachable; `users.is_active` exists (0007), so the STOPGAP sentence above is
  false.
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
  **Superseded 2026-09-02 — see the table at the head of this section:** 27 scripts,
  15 of which carry a live-database refusal.
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
  **Superseded 2026-09-02 — see the table at the head of this section:** four sync
  states (`syncing` is the fourth) and an eight-member `SendOutcome`.
- **Storage** (`src/adapters/sqlite/`): bills store, crash-safe draft
  store, master-data cache store, shared driver and mutex, schema.
  Money and weight are TEXT — the guarantee is the TypeScript type,
  not the column (`lessons/sqlite-money-is-text.md`).
  **Superseded 2026-09-02 — see the table at the head of this section:** eleven
  adapter files.
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
  **Superseded 2026-09-02 — see the table at the head of this section:** 28 screen
  files under `mobile/app/`.
- **The owner's screen** (`app/DailyScreen.tsx`, `src/reports/dailyView.ts`):
  the day's total, the permanent understatement caveat, voided bills, voids
  applied today against older bills, off-list payments, and the bill list. Read
  only; needs the server; renders calmly when it cannot have one.
  **SUPERSEDED 2026-08-31 (P1.23 item 4 unit 3): `app/DailyScreen.tsx` was DELETED.**
  The owner's screen is now the DASHBOARD (`app/DashboardScreen.tsx`); the per-bill
  list is `app/BillList.tsx`, its live sibling, rendered inside the dashboard's today
  view, and `src/reports/dailyView.ts` (the `/reports/daily` view-model) is unchanged
  and still drives that list. See § Current phase.
- **Proofs**: FOURTEEN headless `npm run prove:*` scripts —
  `sync`, `sqlite`, `money`, `cart`, `entry`, `seller`, `notice`,
  `void`, `time`, `cold`, `clock`, `daily`, `forbidden`, `signout`.
  `prove:signout` (`src/proof/proveSignOut.ts`) covers the refusal path,
  the cleared-session list and the draft that must SURVIVE a sign-out.
  `prove:forbidden` is the
  first mobile proof that REQUIRES the live API: its F6 logs in as the
  seeded staff user and reads the server's actual 403 through the real
  `HttpTransport`. `--offline` skips that case and exits **2**, never 0.
  **Superseded 2026-09-02 — see the table at the head of this section:** 47
  `prove:*` scripts, four of which require the live API.

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
  **Superseded 2026-09-02 (measured at `98cbc2d`):** `users.is_active` EXISTS —
  migration 0007 (`0007_users_is_active.py:173`, 2026-08-07) — and an account CAN be
  locked as distinct from signed out (`POST /users/{user_id}/deactivate`,
  `server/app/users.py:600`). The sentence above was true on 2026-08-06 and false
  from the next day; it is the same claim the table at the head of the What is built
  section corrects, found by the sweep for other phrasings of it.

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
  phone. **SUPERSEDED 2026-08-31 (P1.23 item 4 unit 3): the standalone
  `app/DailyScreen.tsx` was DELETED — its per-bill list is now `app/BillList.tsx`,
  rendered inside the DASHBOARD's today view, which the owner reaches by opening the
  dashboard; `GET /reports/daily` and `dailyView.ts` are unchanged. The R2 device
  observation below stands as a historical record of the screen as it then was.**
  **No longer device-unverified: R2 closed it on 2026-08-06**, admin
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
| `TAP_MIN` | **56** | `CartScreen.tsx:70` **and** `SellerPicker.tsx:37` | **unrecorded — chosen without a written reason.** What IS recorded is the RULE it serves (`CartScreen.tsx:6`, "every tappable thing is at least TAP_MIN tall"). Facts about the number, not reasons for it: 56 exceeds both platform minimums (iOS 44 pt, Android 48 dp). **Two findings beyond the value** — it is DUPLICATED in two files, free to drift; and the rest of the UI does not use it at all, with raw `minHeight` literals of 48 (×6), 44 (×4), 60 (×3), 36 (×2) and 72 — so **the stated standard is honoured in two screens and undercut in others**. **SUPERSEDED 2026-08-30 (P1.23 item 3): the reason is now RECORDED — the owner's B1 wet-hand-target bar — in ONE exported `TAP_MIN` in `mobile/src/ui/theme.ts`, read app-wide; both findings CLOSED (the duplication had spread to SIX files plus Numpad's `KEY_H`, all deleted; every screen now takes the floor from the theme, proven by `proveTapAudit`). `TAP_MIN` leaves the unaccountable set below; value unchanged, so no new trial. | 1 |

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

Eight values were chosen with **no written reason**, in the code or in their
introducing commit: the sync tick (4 s), the UI refresh tick (400 ms),
`HttpTransport.timeoutMs` (20 s), `UNDO_MS` (8 s),
`GET /bills` limit (50/200), both `backoff` knobs at their call site, and
`JWT_TTL_SECONDS`. (**NINE → EIGHT 2026-08-30, P1.23 item 3: `TAP_MIN` (56) left
this set — its reason is now recorded in `mobile/src/ui/theme.ts`.**)

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
  **SUPERSEDED 2026-08-30 (P1.23 item 3): no longer true and no longer in this set.
  `TAP_MIN` gained its recorded reason and one home in `mobile/src/ui/theme.ts`, and
  the sweep raised every sub-56 floor; the sentence stands only as the record of what
  was true before.**

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
