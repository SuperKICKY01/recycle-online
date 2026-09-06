# Evidence

The dated incidents, refutation history, and measurement provenance moved out
of `CLAUDE.md` in the 2026-08-16 restructure. Every indented block below is
character-for-character the text that stood in `CLAUDE.md` at `742ff65`, cut at
sentence boundaries: where a cut falls mid-line, that line's remainder stays in
`CLAUDE.md` and the wrap positions inside a block are unchanged, so a block's
first or last line may be short. Nothing was rewritten in the move, so a phrase
like "the bytes above" or "recorded above" inside a block still refers to text
that now lives in `CLAUDE.md` — each section's preamble says what stayed
behind. NOTHING HERE IS A RULE: every rule these incidents earned still stands
in `CLAUDE.md`, and if a block here seems to disagree with a rule there, the
rule is current and this file is history. Corrections to this file: supersede
and date, never rewrite.

Sections are titled by the rule they back, in `CLAUDE.md`'s order.

## CP874 writer: the five-layer measurement

Backs `CLAUDE.md § Machine footguns` "THE SAME CODEPAGE, THE OPPOSITE
DIRECTION". The trap statement, the measured byte counts and the remedy stay
in that entry; this is the five-layer measurement of 2026-08-10 behind them,
and the two bounds on that measurement.

  IT LIES BY BEING CORRECT ON THE ONE LAYER ANYONE INSPECTS. Measured
  across five layers of the provisioning path the same day — the
  command-line argv hop, the row written to and read back from
  Postgres, the `COPY` block inside the `pg_dump` body, and that row
  again after a restore — **all four layers that PERSIST the name were
  byte-exact UTF-8, and the only layer that re-encoded was stdout.**
  The layer that mangles is the one a person checks by eye; the four
  that matter are ones nobody sees. Judging by the console would have
  given the opposite of the truth in BOTH directions: the output
  looked right, and there would have been no reason to check the four
  that were.

  Two bounds, so
  the measurement is not over-trusted: the stdout figure is a PROXY,
  the same interpreter writing the same string to a redirected stream
  rather than the captured bytes of the original run, which cannot be
  recovered from where the reader sits; and the name carried
  above-line vowels and a thanthakhat but NO below-line vowel, so that
  class is untested.

## core.autocrlf: the measured table and its history

Backs `CLAUDE.md § Machine footguns` "`core.autocrlf` is `true` here". Five
pieces; the rule text between them — which object to measure, how, the
`lessons/README.md` exclusion, the `git add` warning, and the never-let-the-
warning-be-the-observation rule — stays in that entry.

  They are in the table below, each labelled,
  with the commit they were taken at.

  **BOTH OBJECTS, EACH LABELLED. Measured at HEAD `0241cc8`, 2026-08-10:**

  | object | bytes | CR | LF | CRLF | BOM | ending |
  |---|---|---|---|---|---|---|
  | blob at HEAD | 51504 | **0** | 54 | 0 | `efbbbf` | **LF** |
  | working tree | 51558 | 54 | 54 | 54 | `efbbbf` | **CRLF** |

  The commands, one per invocation, bytes and never text.
  `git rev-parse HEAD:lessons/README.md` for the blob sha, then
  `git cat-file blob <sha>` captured as raw bytes with the CRs counted in
  those bytes; the working tree by reading the file's bytes off disk. Two
  independent instruments agreed with the capture: `git cat-file -s` returns
  51504, equal to the length captured, so nothing in the path rewrote an
  ending on the way; and `git ls-files --eol -- lessons/README.md` reports
  `i/lf  w/crlf  attr/text=auto eol=lf`, which is git's own verdict — index
  LF, working tree CRLF. The values above will go stale at the next lesson;
  the METHOD will not, and the method is the part that belongs here.

  **A VALUE HERE WAS BELIEVED, MEASURED, AND FOUND FALSE — TWICE, AND THE
  SECOND OVERTURN RESTORED THE FIRST.** What stood in this passage read
  "blob at `62cee25` CRLF 41/41 … blob at `9f929ad` CRLF 42/42", offered as
  four agreeing points; and above it a paragraph announcing that an earlier
  appended correction — which had claimed those blobs were LF — was itself
  wrong. **The blob half of both was false, and the appended correction it
  overturned was right.** Measured across every one of the 45 commits that
  have ever touched this file: `CR=0` in all 45 blobs. It has not once been
  committed with a CR. The two commits named measure blob `03224812`, 24531
  bytes, CR=0, LF=41; and blob `dd4634ad`, 25619 bytes, CR=0, LF=42. **The
  LINE COUNTS were right and the ENDING was wrong, at every point** — which
  is why it survived two readings: the half anybody could check was correct.
  The false figures are not kept as text, because a wrong footgun misleads
  every session that reads it; the fact that they were held and refuted is
  kept, because it is the only reason to trust the ones above.

  **WHAT PRODUCED IT IS NOT ESTABLISHED HERE, AND IS NOT GUESSED.** No
  record survives of the commands that were run, and a guessed cause in a
  footgun is exactly how this passage went wrong the first time. Two things
  are measured rather than supposed. The reported blob figure is IDENTICAL
  to the working-tree figure at the same commit, which is the shape a
  working-tree reading reported as a blob reading would have. And on this
  box a native command's output never reaches PowerShell as bytes at all:
  `$out = & git show HEAD:lessons/README.md` yields an `Object[]` of 54
  strings holding **zero** CR and **zero** LF between them — the endings are
  consumed and replaced by array structure, and whatever writes that array
  back out chooses new ones. **A line ending measured through PowerShell is
  therefore a property of the writer, never of the blob.**

## Measure-Object -Line: the measured undercounts

Backs `CLAUDE.md § Machine footguns` "`Measure-Object -Line` does not count
blank lines". The mechanism, the danger-direction sentence, the
both-spellings warning and the remedy stay in that entry; these are the two
measured instances and what the wrong number would have done.

  `Get-Content -Encoding UTF8 PROJECT_STATUS.md |
  Measure-Object -Line` returned **1823** where `wc -l` and a raw LF-byte count
  both return **2053** — 230 blank lines silently dropped. `lessons/README.md`
  came back 40 against an actual 42, by the same mechanism.

  The number it produced was not
  merely wrong, it was wrong across a THRESHOLD: `PROJECT_STATUS.md` sets its own
  split-review trigger at "Revisit at 2000 lines" in its own text, so 1823 reads
  as comfortably under while the file is 53 lines past it. A stale reference that
  had been correctly identified would have been dismissed as already fixed, and
  nothing would have looked wrong — there is no error, no red, and the command is
  the obvious PowerShell one to reach for.

## git commit -F: the two occurrences

Backs `CLAUDE.md § Machine footguns` "`git commit -F <path>` exits 128". The
mechanism and the write-the-file-first remedy stay in that entry.

  **It has happened TWICE in one session** — before `12d16a2` and again before
  `fc9cd5c`, the second time after the first had already been noticed and
  reported out loud, which is what makes it a footgun and not a slip. Nothing is
  committed and the staged tree survives, so the cost is a wasted round trip
  rather than a bad commit. The real cost is subtler: the recovery is to write
  the file and re-run, and the reply then has to claim the message is "verbatim
  as drafted" with nothing checking that it is.

## Exit-line absence: the observed restores

Backs `CLAUDE.md § Machine footguns` "An exit code cannot be read by a
SEPARATE tool invocation" — specifically its exit-line passage: the
absence-is-the-signal rule and the `restore_db.py` mechanism stay in that
entry; this is the observation behind them.

  Observed twice on 2026-08-09, both runs exit 1 with no exit line.

## -Source binding: the measured run and the second hole

Backs `CLAUDE.md § Machine footguns` "binds the FIRST value". Two blocks; the
PowerShell binding mechanism, the SOURCES=1 tell, the comma-spelling contrast
and the call-operator remedy stay in that entry.

  Measured 2026-08-09, six sources named on one command line:

      powershell -File tools\verify_citations.ps1 -Source START_HERE.md
        ARCHITECTURE.md ROADMAP.md OPEN_ITEMS.md SRS_MAP.md PROJECT_STATUS.md

      SOURCES=1  CITATIONS=42  BROKEN=0          EXIT=0

  One file was read. Five were named and never opened, and nothing said so.

  AND THIS IS THE SECOND HOLE OF THIS KIND IN ONE TOOL. The first is already
  recorded: `verify_citations.ps1` once hardcoded `START_HERE.md` as its only
  source and printed `BROKEN=0` over `ARCHITECTURE.md`'s 37 citations without
  opening the file — a green structurally incapable of turning red, written up
  at
  `lessons/a-check-that-never-went-red-was-never-observed.md § a fifth mechanism`.
  That hole was closed by adding `-Source`; this one is in `-Source` itself.
  **Two holes, one tool, both ending in exit 0.** The `§ a sixth mechanism`
  amendment in the same file already records that the tool's DEFAULT source
  list is stale, so a session choosing between "type the sources by hand" and
  "run it bare" has now been wrong in three different ways.

## Out-File BOM: the incidents and the bounds

Backs `CLAUDE.md § Machine footguns` "PowerShell's `>` puts a BOM". The
mechanism, the measured sixteen bytes ("the bytes above" below), the
first-line-only recognition and both remedies stay in that entry.

  Twice in one day here. A list of paths captured this way was
  intersected with another set and came back **EMPTY** — read as "nothing to
  do", and indistinguishable from a true empty answer, while the real
  intersection was not empty: the first path carried U+FEFF in front of it and
  equalled nothing. The second time a set DIFFERENCE reported a mismatch that
  did not exist, the same bytes making one element unequal to its own twin.
  Neither raised an error; both printed a plausible number.

  TWO BOUNDS, so this is not over-trusted. The `>` operator itself was NOT run:
  the round that wrote this entry had banned it outright, and the bytes above
  come from `Out-File`, the cmdlet `>` is the redirection form of. And this
  session carries `$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'`
  with NO user profile on disk, so the UTF-8 signature is set by whatever
  starts PowerShell here rather than being this build's own default — 5.1's
  own default is `unicode`, a TWO-byte `FF FE` with every ASCII character
  doubled. **A BOM either way; WHICH one is unverified.** The symptom seen both
  times — one element silently unequal and everything else intact — is what
  three bytes on the first line do, where UTF-16LE would have broken every
  string at once and broken it loudly. Evidence for the three-byte branch, not
  proof of it.

## grep -iF Aborted: the locale split and the false zeros

Backs `CLAUDE.md § Machine footguns`. The trap statement, the locale trigger and
the remedy — never combine `-i` with `-F` here, and a positive control in the
same invocation — stay in that entry; this is the 2026-08-20 measurement, the
excluded causes and the measured cost, moved here in the 2026-08-28 compaction.

  Measured 2026-08-20, every invocation bare with the status read in the same
  call:

      LC_ALL=C            grep -iF "daily money" PROJECT_STATUS.md  -> Aborted, 134
      env -u LANG -u LC_ALL grep -iF "daily money" PROJECT_STATUS.md -> Aborted, 134
      LC_ALL=C            grep -F  "daily money" PROJECT_STATUS.md  -> 0, 8 lines
      LC_ALL=C            grep -i  "daily money" PROJECT_STATUS.md  -> 0, 9 lines
      LC_ALL=en_US.UTF-8  grep -iF "daily money" PROJECT_STATUS.md  -> 0, 9 lines

  EXCLUDED, each by its own measurement: PATH and aliasing (`type -a grep` shows
  no alias and no function), the binary (`md5sum /usr/bin/grep` =
  `65b7eb148ea01dacf451bed0d1a4608e`, identical on both sides and to
  `/bin/grep`), the absolute path, the file (a two-line file outside the
  repository aborts identically under `LC_ALL=C`), the needle, and the working
  directory.

  WHY IT LIES, the entry's whole value: RE-RUNNING IT CANNOT DISCOVER IT. The
  failure is DETERMINISTIC WITHIN A SESSION and opposite BETWEEN sessions — a
  session carrying no locale gets 134 every time; a session carrying
  `LANG=en_US.UTF-8` gets 0 every time and correctly reports no reproduction.
  On 2026-08-20 that was seven bare aborts in one session against nine bare
  exit-zeros in another, same repository, same day, same binary. The usual
  defence, run it again, is the one defence that cannot work.

  And it fails toward a plausible number: under `2>/dev/null` piped to `wc -l`
  an abort is indistinguishable from "not found", because stderr is discarded
  and a pipeline's status is the last command's. MEASURED COST — one loop over
  twelve search terms returned twelve zeros, every one false; the control term
  in that set is present in six tracked files.

  This supersedes, BY MEASUREMENT, the same-day conclusion that CLAUDE.md should
  get nothing because the behaviour was not characterised. The open half — which
  shell exported which locale, and why — stays at
  `OPEN_ITEMS.md § Documentation`.

## ripgrep NUL-skip: the silent directory undercount

Backs `CLAUDE.md § Machine footguns` "A NUL byte anywhere in a file makes ripgrep".

`mobile/src/proof/proveDaily.ts` carried ONE NUL byte at offset 10412 — a corrupt
leak needle, `"Z\0"` where `"Z "` (Z + space) belonged, fixed in M4 c1b. While the
NUL was there, ripgrep classified the file as binary and skipped it in DIRECTORY-mode
search, with no error and no mention of the file — so a sweep or count over that
directory silently omitted it.

Measured three ways in one pass, each with a control:
- A directory `rg` for `process\.exitCode` across `mobile/src/proof/` listed 39
  files; proveDaily.ts was absent although it holds the pattern. The truth was 40.
- The M4 c1 sweep-comment search listed 22 files; proveDaily carried the identical
  comment (confirmed by the Read tool) and was absent — the truth was 23.
- POSITIVE CONTROL: `understatement_reason_th`, present on exactly one line of
  proveDaily.ts (L209), returned 0 in DIRECTORY mode and 1 on the EXPLICIT PATH. A
  content grep on the explicit path prints `binary file matches (found "\0" byte
  around offset 10412)` — the tell that the file was SKIPPED, not that the pattern
  was absent.

The adversarial verify that caught the proveSignOut miss caught this too: a
grep-based sweep verification is blind to a NUL-bearing file exactly where a count
decides completeness. After c1b removed the NUL, the same directory
`understatement_reason_th` search returns 1 — the file is visible again. But the
GENERAL trap survives the fix: any file that later acquires a NUL vanishes from a
directory grep the same silent way, so a decision-bearing count is cross-checked
against an explicit file list or a NUL-tolerant reader, and every zero carries a
positive control.

## NTFS colon: the hundred logs on one file

Backs `CLAUDE.md § Machine footguns` "A COLON IN A FILE NAME DOES NOT FAIL ON THIS BOX".

Measured 2026-09-06, during the suite survey that preceded `tools/prove_all.py`. The
survey driver named each log after its proof, so the fifty mobile proofs wrote
`results\prove:login.run1.log`, `results\prove:sync.run2.log` and so on — a hundred
files by intent. NTFS read every `<name>:<rest>` as `<file>:<stream>`: the directory
held ONE file named `prove`, and `Get-Item results\prove -Stream *` counted 101
streams (the hundred logs plus the unnamed default `:$DATA`). Nothing failed at write
time; Python's `Path.read_bytes()` on the colon path read each stream back, so the
driver's own cell scan saw every log's content and reported it. The tell came only
from a second reader: `tail results/prove:login.run1.log` under Git Bash answered
`No such file or directory` for a file the driver had just summarised.

Two consequences, both silent. (1) A directory copy (`cp -r`, an archive, a
git add) carries the file `prove` and drops every stream, so the evidence would have
survived only on this disk. (2) A reader looking for the log by name concludes it was
never written — the same shape as the exit-line-absence footgun, arriving from the
file system rather than the shell. `tools/prove_all.py` therefore names its logs with
the colon replaced (`prove_login.run1.log`) and says so in its docstring; the survey's
own logs were read back for the record through `Get-Content -Stream`. Two-homes test:
this is a property of NTFS on the box the proofs run on, not something the project
would relearn about its own code — a footgun, not a lesson.

## Boot check: the incidents behind three observables

Backs `CLAUDE.md § Boot check`. Three fragments, one per bullet — the two
TypeScript programs, Postgres-before-login, and which-bundle — in that order;
every observable and every rule stays in those bullets.

  The app program has twice
  caught defects the node program cannot see: a shadowed `reason`
  that would have detached the void TextInput from its state, and a
  narrowing lost across a closure.

  A 500
  from `/auth/login` with the container down has already been
  misdiagnosed once as a schema fault — blamed on a migration that
  did not exist.

  It has already cost two
  days here: a sync-strip defect was hunted through `engine.ts`,
  `queueHealth.ts` and `statusNotice.ts`, all three correct, and the
  `ออฟไลน์` that started it did not reproduce once the bundle was
  current. Worse, the phantom was written down as an observation in a
  lessons file and in `PROJECT_STATUS.md` before anyone doubted it.

## Measure-before-the-write: the provisioning argv check

Backs `CLAUDE.md § Workflow` "WHEN THE WRITE CANNOT BE UNDONE". The rule and
its reasons stay in that bullet; this is the one time it has been exercised.

  EARNED 2026-08-10: the shop name for the pilot is Thai, and the
  command-line hop into the script was measured — argv hexed and
  compared against an expected value fixed from a file — BEFORE the
  provisioning ran. It matched, so nothing came of it. Had it not, the
  alternative was a permanently mangled name in a row that cannot be
  deleted, discovered by the check that would otherwise have run one
  command later. The cost of measuring first is one command; the cost
  of measuring second is the whole row.

## A-report-is-a-clue: the recorded instances

Backs `CLAUDE.md § Workflow` "A REPORT IS A CLUE, NOT A SOURCE". The rule, the
promotion-into-a-prompt mechanism, the third instance's header and its
caught-by-the-sweep sentence, the order-the-sweep rule, the ninth-item
checkpoint and the limitation stay in that bullet. Three pieces here: the
first two instances, the third instance's story ("the `clear()` claim
recorded above" in the third piece refers to it), and the four claims of
2026-08-12.

  It happened twice in one day here: a stale "still open"
  premise that `grep -c` refuted at 0 occurrences, and a phase criterion
  built on a claim about what was on disk. Both were caught only because
  the pass that inherited them measured instead of assuming.

  The claim was that `SecureTokenStore.clear()` "has never been executed
  anywhere — not by any proof, on any machine". The advising session
  asserted it all day; a session report repeated it; and it arrived back
  as the premise of a brief. `PROJECT_STATUS.md` had recorded the
  opposite since **2026-08-06** — the R1b pass exercised `clear()` on a
  real iPhone and the Keychain really did clear — in two separate
  passages, in the file whose whole job is to hold that answer. **Nobody
  opened it for six days.** What makes this one worth the space is the
  SIZE of what was built on it: an Android build was produced, a device
  pass was designed, and a commit was drafted, all on a premise one
  `git grep` refutes.

  **FOUR MORE LANDED IN ONE DAY, 2026-08-12, AND THE POINT IS NOT A FOURTH
  ANECDOTE — IT IS THAT THE RULE HAS NO CHECKPOINT WHERE IT FAILS.** Four
  negative claims were made by the ADVISING session in a single day, each
  answered out of the conversation rather than out of the files that session
  holds: that the seller table lacked identity fields, when migration `0004`
  added `id_number`, `address` and `vehicle_no` on 2026-07-28; that master data
  would have to be seeded before a handset could weigh, when `seed_dev.py`
  already creates uoms, categories, products, prices and sellers; that the void
  queue's owner filter was unbuilt, when `cfb6633` had put it in
  `listVoidsToApply`'s predicate; and the `clear()` claim recorded above.
  **ALL FOUR WERE NEGATIVE CLAIMS** — there is no, it is not, nothing does —
  and each was refuted by one grep.
  **WHY THE RULE ABOVE DID NOT CATCH THEM, which is the whole finding.** It is
  enforced entirely on the IMPLEMENTING session's path: a reading order, a boot
  check, a `Prove:` block, a brief that can be checked part by part against
  `START_HERE.md § 3`. **The advising session has no such path.** It reads the
  same files and nothing requires it to open one before it answers. So the rule
  was applied to the role that was not making the error — which is why three
  instances were recorded here and the rate did not change.

  TWO MORE, 2026-09-06, both about PROOFS and both caught by running the whole
  suite under one instrument instead of reading the last report of it. (1)
  `1887054`'s record listed `prove_user_create` under `Every other server proof GREEN
  TWICE:`; the file had been dying at its first gate since 0019 dropped
  `users.role`, and the same commit had EDITED it. The survey read exit 1 twice, 0
  cells. (2) The 0020 record called `prove:login` "a proof whose result is
  UNREADABLE" from one observation of a second-run red, and the advisor carried
  that verdict into the next brief. The mechanism, measured: two `failed` rows per
  run against a threshold of five in fifteen minutes — green, green, red on the
  THIRD run (7 FAILED, five rows), and the 2026-09-05 red came from a scratch whose
  inherited rows were still inside the window. The conclusion was wrong in both
  directions: the proof WAS readable twice, and it WAS a trap for any instrument
  that runs it a third time. `tools/prove_all.py` is the standing answer to the
  promotion mechanism for proofs: the report of the suite is now produced by the
  run, not remembered from it.

## Skills are paths: the paraphrase and the tripwire firing

Backs `CLAUDE.md § Workflow` "For any debugging". The OPEN-and-follow rule,
both paths, the two-copies-drift reason and the tripwire rule stay in that
bullet. The byte counts moved HERE by the owner's 2026-08-16 ruling — the
file is the authority the moment they disagree, so numbers in `CLAUDE.md`
buy nothing and rot. In the bullet they stood verbatim as `(6,337 bytes).`
after the debug-mantra path and `(13,096 bytes).` before the
Paths-not-a-summary sentence — RAW working-tree bytes as the entry recorded
them. The which-kind-of-number caution below is about exactly those figures.

  Five lines of paraphrase stood here in
  place of both bodies; a measured session made 204 tool calls and
  opened neither file, so the paraphrase is what got acted on — and
  it omitted the step ordering, the escalation inside step 2, and
  five of the six principles.

  **Know which kind of number you are holding.** These are RAW
  bytes of the working-tree file, and both files are CR=0 today — so
  raw and LF-normalised sizes are IDENTICAL, and no measurement taken
  now can tell you which definition this line used. That makes the
  numbers worth less than ones whose definition can be checked; they
  diverge by exactly 90 and 161 the moment either file carries CRLF
  again, which is what tracking normalised away.

  The check HAS been
  seen to fire: on 2026-08-08 one byte appended to debug-mantra
  reddened that file's cell alone while its neighbour stayed green,
  and restoring returned the committed blob byte for byte.

## Two homes: the widening

Backs `CLAUDE.md § Workflow` "Two homes, one test". The test itself, in its
widened wording, and the footgun-line-does-not-move clause stay in that bullet.

  **WIDENED 2026-08-08, and the wording it replaces is the reason.**
  This read "a LESSON is for what would cause a bug in the PRODUCT",
  which was true of every lesson in the index — until that date a
  product bug was the only thing this project operated on. It now
  operates on a SECOND thing: an agent layer under `.claude/` that it
  writes, dispatches, and believes the output of. A finding about how
  we run our own instruments — a scan that read its own command, a
  gate that logged the search into the medium being searched, a role
  definition asserting something the files refute — costs the same to
  relearn as a product bug, and is a LESSON. Under the old wording it
  was homeless: not a product bug, and not a property of this box.

## Pin-a-claim-to-a-commit: the measured evidence

Backs `CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT". The rule, its
corollary, the supersede fallback and the keep-a-citation-on-one-line story
stay in that bullet; these are the two measurements behind it.

  Measured 2026-08-11:
  `mobile/src/adapters/sqlite/schema.ts` said its migration's atomicity was
  proved at `7b4f22d`, whose stat over that path and over the proof's path is
  EMPTY — the transaction and its proof both landed at `a471dc2`.

  **THE EVIDENCE IS ONE FILE, ONE SUBJECT, TWO SENTENCES.**
  `ARCHITECTURE.md:820` and `:888` were written the same day about the same
  three routes; `:820` is anchored and is still true as written, `:888` was
  present-tense and went false at `cb11f6a`, and it is the WORSE of the two to
  get wrong because it is a REASON rather than a status — a reader believes a
  reason and then builds on it, where a wrong status merely confuses.

## Co-Authored-By: the trailer census

Backs `CLAUDE.md § Conventions`. The rule — a bare model name, and read the log
bare before writing a message — and the harness-parenthetical warning stay in
that entry; this is the census behind them, which rots and is therefore pinned
here, moved out in the 2026-08-28 compaction.

  Measured 2026-08-17 at `1204081`: 177 commits, 165 carrying the trailer, four
  distinct values — `Claude Opus 5` 134, `Claude Opus 4.8` 17, `Claude Fable 5`
  13, and one parenthetical (`Claude Opus 5 (1M context)`, at `56b5008`, landed
  from a harness default that nothing caught). The MODEL name varies legitimately
  with whoever did the work; the parenthetical does not. No hook reads the
  trailer, and a wrong one cannot be amended without rewriting history.
