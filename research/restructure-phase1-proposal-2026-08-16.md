# Restructure — Phase 1: measurement and proposed structure

Date: 2026-08-16. Repository state: HEAD `742ff65` (`git rev-parse --short=7 HEAD`),
tree as per session-start status (three untracked files: ARGUS_MOBILE_READ.md,
COMMIT_MSG.txt, UNCOMMITTED_DOCS.diff — none edited, none needed). Read-only pass:
no file in the repository was edited, created, or committed. This file lives
outside the repo on purpose.

Inputs treated as CLUES and re-measured: the web-research report
(claude-code-memory-workflow-research-2026-08-12.md) and the architecture audit
(architecture-audit-2026-08-13.md, taken at `5957042`, five commits old). The
audit turned out to contain NO measurement of CLAUDE.md's sections — it measures
server/mobile code. The "57% / mostly narrative" figures in the phase brief exist
in neither file; both were derived fresh below, and one of the two is confirmed,
the other is rubric-dependent and stated both ways.

---

## TASK 1 — the measurement, at HEAD `742ff65`

### Instruments, named

- Total lines: `wc -l` from the Bash tool (counts LF bytes). Second, independent
  instrument: the Read tool's last line number over the same file. CLAUDE.md:
  wc-l **780**, Read's last line **780** — agree; trailing newline present.
  START_HERE.md: wc-l **190**, Read's last line **190** — agree; trailing
  newline present. (Per the Machine-footguns rule, the definition used is
  LF-count = content lines here, since both files end in a newline.)
- Bytes: `wc -c` — CLAUDE.md 47,981; START_HERE.md 11,968.
- Section boundaries: Grep `^#{1,3} ` with line numbers over each file.
- Rule/narrative split: Read (both files read in full, every line seen) + hand
  classification at paragraph-block granularity against the rubric below.
  No automated classifier exists for this; the counts are a person's judgment
  applied consistently, uncertainty roughly ±5 lines on the two large sections
  (Machine footguns, Workflow), smaller elsewhere. Cross-check: every section's
  rule + narrative + heading + blank sums exactly to its Grep span, and the
  file totals sum to the wc-l counts.

### Rubric (stated because the answer turns on it)

- **rule** — a line a session must act on now: an imperative, a prohibition, a
  command or observable, a current machine/config fact needed to act, a remedy
  ("Instead: …"), or an undated defining example that IS the symptom spec.
- **narrative** — a line recording the learning event: dates, "measured
  2026-08-10", "OBSERVED", "it has happened TWICE", tables of past
  measurements, refutation history, bounds-of-that-measurement, and the
  entry's own edit history.
- **structure** — headings and blank lines, counted separately.

The brief's implicit rubric is different (anything that is not an active rule
counts as the cut), so §"Reconciling the brief's numbers" below reports both.

### CLAUDE.md by section

| section | span | lines | rule | narrative | heading+blank |
|---|---|---|---|---|---|
| preamble | 1–14 | 14 | 9 | 0 | 5 |
| Architecture (LOCKED) | 15–27 | 13 | 9 | 0 | 4 |
| Hard rules | 28–50 | 23 | 20 | 0 | 3 |
| Scope and status | 51–69 | 19 | 14 | 0 | 5 |
| Machine footguns | 70–515 | 446 | 283 | 114 | 49 |
| Boot check (### under footguns) | 516–566 | 51 | 34 | 13 | 4 |
| Workflow | 567–732 | 166 | 94 | 69 | 3 |
| Conventions | 733–780 | 48 | 26 | 20 | 2 |
| **total** | | **780** | **489** | **216** | **75** |

Machine footguns, per entry (content lines exclude blanks; "core" is the
estimated irreducible symptom+remedy a condensed entry keeps — an estimate,
labelled as such, not a measurement):

| entry (title handle) | span | content | narrative | est. core |
|---|---|---|---|---|
| section intro | 72–73 | 2 | 0 | 2 |
| Correct Thai reads as mojibake | 75–88 | 14 | 0 | 6 |
| THE SAME CODEPAGE, THE OPPOSITE DIRECTION | 90–129 | 38 | 16 | 6 |
| A non-ASCII character in `.ps1` SOURCE | 131–151 | 21 | 0 | 7 |
| An exit code that is not the command's | 153–159 | 7 | 0 | 7 |
| A pipe or `&&` hides a non-zero exit | 161–169 | 9 | 1 | 8 |
| A child process's output arrives CRLF | 171–182 | 12 | 0 | 6 |
| Multi-line text passed as a shell argument | 184–206 | 22 | 4 | 8 |
| `core.autocrlf` is `true` here | 208–310 | 94 | 41 | 12 |
| `Measure-Object -Line` undercounts | 312–339 | 25 | 5 | 8 |
| `git commit -F` exits 128 | 341–361 | 19 | 7 | 5 |
| An exit code cannot be read by a SEPARATE invocation | 363–399 | 34 | 1 | 10 |
| `powershell -File -Source` binds the FIRST value | 401–449 | 42 | 13 | 8 |
| PowerShell's `>` puts a BOM | 451–514 | 58 | 26 | 10 |
| **sum** | | **397** | **114** | **~103** |

The single `core.autocrlf` entry is 94 content lines — 12% of the whole file —
of which 41 are the two-times-refuted measurement saga and its forensics.

### START_HERE.md by section

| section | span | lines | rule | narrative | heading+blank |
|---|---|---|---|---|---|
| preamble | 1–12 | 12 | 9 | 0 | 3 |
| §1 Reading order | 13–56 | 44 | 25 | 13 | 6 |
| §2 Who writes what | 57–127 | 71 | 54 | 13 | 4 |
| §3 The phase brief | 128–154 | 27 | 22 | 0 | 5 |
| §4 Done — the observables | 155–190 | 36 | 28 | 0 | 8 |
| **total** | | **190** | **138** | **26** | **26** |

START_HERE.md is already what the brief wants CLAUDE.md to become: 84% of its
content lines are rule (138/164), and its two narrative pockets are small and
localised — the PROJECT_STATUS line-count saga in §1 (7 lines, 23–30) plus the
`.claude` supersession record (6 lines, 46–52), and in §2 the 2026-08-09
stale-status story (5 lines, 86–90) plus the checklist-search record (8 lines,
within 107–120).

### Reconciling the brief's numbers

- **"The footgun section is 57% of the file" — CONFIRMED.** 446/780 = 57.2%
  (footguns proper, excluding the Boot check subsection). Including Boot check:
  497/780 = 63.7%. Tool: Grep section spans + wc-l, above.
- **"…and mostly narrative" — TRUE OR FALSE BY RUBRIC, and Phase 2 must know
  which it is using before it cuts.** Under the dated-incident rubric above,
  footgun narrative is 114/397 content lines = **29%** — not "mostly".
  Under the brief's operational rubric — "what is an active rule that must
  fire every session" — the irreducible core is ~103/397 = **26%**, i.e.
  ~74% of the section is mechanism-explanation and evidence that could move.
  The difference between the two rubrics is the mechanism prose ("why it
  lies"), which is neither a dated incident nor an active rule. The cut is
  real either way; its size is ~290 lines, not ~400, and the remedy lines
  buried mid-entry (the `-Source` array spelling, write-the-commit-file-first,
  count-LF-bytes) are ACTIVE RULES that must survive the cut.

---

## TASK 2 — every rule the advisor must follow, and where it lives

"Survives (chat)" = reachable by a brand-new advising CHAT whose owner forgot
to paste anything: nothing in the repo is reachable, so the only rules that
survive are ones inside the chat's own project instructions — which is the
seam. "Survives (terminal)" = reachable by a fresh in-project TERMINAL advisor
session with no opening prompt: CLAUDE.md auto-loads; everything else loads
only if something points the session at it and the session follows the pointer.

| # | rule | lives at (HEAD `742ff65`) | survives (chat) | survives (terminal) |
|---|---|---|---|---|
| 1 | Reads BRIEFING.md, NOT the codebase; advises on sequence and soundness only | START_HERE.md §2; BRIEFING.md "Who this is for" | no | on-demand only |
| 2 | Does not write production code | START_HERE.md §2 | no | on-demand only |
| 3 | What arrives from it is an argument, never an observation; "Read actual files" applies to it unchanged | START_HERE.md §2; CLAUDE.md § Workflow "A REPORT IS A CLUE" | no | **yes** (CLAUDE.md loads) |
| 4 | UNPROMPTED at phase boundary: NAME the stale documents, by name (always PROJECT_STATUS.md; then OPEN_ITEMS/ROADMAP/SRS_MAP as touched; NOT BRIEFING/ARCHITECTURE unless architecture or a hard rule moved) | START_HERE.md §2 only | no | on-demand only |
| 5 | UNPROMPTED when a commit touches a paste-set file: instruct rebuild + re-paste in the same message, via `build_paste_set.py --check/--write` and its exit semantics | START_HERE.md §2 only | no | on-demand only |
| 6 | The pre-send checklist — NINE items governing every answer | the advising chat's own instructions, NOT in the repo | only if the chat still has it | **no — 8 of 9 items exist nowhere on this machine's tree** |
| 7 | Ninth item's content: a negative claim names the sentence relied on and the WORDS searched; absent evidence is "not found with these words", never "there is none" | CLAUDE.md § Workflow "A REPORT IS A CLUE"; OPEN_ITEMS.md § Documentation | no | **yes** (CLAUDE.md loads) |
| 8 | Whoever opens an advising chat must send the checklist with it | CLAUDE.md § Workflow (limitation passage); START_HERE.md §2 | no | **yes** — but it is a rule about a gap, not the gap's content |
| 9 | Items under OPEN_ITEMS § Decisions open are the owner's to settle, not the advisor's | START_HERE.md §2 | no | on-demand only |
| 10 | Read ROADMAP.md "Where I disagree with the spine" before advising on sequence | BRIEFING.md §6 | no | on-demand, two pointer hops deep |
| 11 | BRIEFING.md carries no progress claims; updated only when architecture or a hard rule changes | CLAUDE.md § Scope and status; BRIEFING.md header | no | **yes** |
| 12 | The phase-brief shape it writes: five parts, well-formed `Prove:` naming a command/exit-code/observable | START_HERE.md §3 | no | on-demand — but double-covered: the implementing session refuses a malformed brief |
| 13 | Brief routing-header conventions (`SEND TO:` / `RUNS COMMANDS:` / `WRITES TO A DATABASE:`) | **nowhere in the tree** — Grep `SEND TO|RUNS COMMANDS|WRITES TO A DATABASE` over `*.md` in the working tree (tracked + untracked): not found with these words | only in the chat's practice | **no** |

The load-bearing negatives, each named with pattern and root per the brief:

- **Rows 6 and 13 are the seam.** The checklist's eight unseen items and the
  brief-header conventions exist only inside a conversation this repository
  cannot see. Search that established row 6: recorded in START_HERE.md §2 and
  OPEN_ITEMS.md § Documentation (line 3303 block) — `pre-send`, `presend`,
  `checklist`, `before sending`, `before it answers`, `ninth item`, `nine
  items`, case-insensitive, over every tracked `*.md`: not found with these
  words (their search, 2026-08-12; nothing in this pass contradicts it).
  Search for row 13: `SEND TO`, `RUNS COMMANDS`, `WRITES TO A DATABASE`
  (Grep, glob `*.md`, root `E:\recycle-online`, this pass): no matches.
- **Every in-repo advisor rule except rows 3/7/8/11 lives in files that load
  only on demand** — the exact mechanism the project's own record shows
  failing (a session made 204 tool calls without opening a path-ordered
  skill file: CLAUDE.md § Workflow "For any debugging"), and that Vercel
  measured failing silently in 56% of eval cases (research report §2).
  The rules that DO survive a terminal advisor's cold boot survive for one
  reason only: they happen to sit in CLAUDE.md, the one file that loads
  unconditionally.
- **Nothing at HEAD routes an advisor session anywhere.** CLAUDE.md's preamble
  routes "New session" to START_HERE.md — a file addressed to the implementing
  role. There is no advisor-addressed pointer in the always-loaded file. That
  is the one structural fix the proposal below makes.

---

## TASK 3 — the proposed structure

### The mechanism the whole proposal rests on

The research report's relevant hard findings (all §-cited there): CLAUDE.md is
delivered as a user message with no compliance guarantee, official target
<200 lines; on-demand files silently fail to load (Vercel 56%); `@path`
imports do NOT keep content out of context — imported files load in full at
launch, so **the evidence file below must be a plain pointer target, never an
`@import`**; project-root CLAUDE.md is re-injected after `/compact`, nested
files and path-scoped rules are not — so **everything always-loaded stays in
the root CLAUDE.md, and nothing moves into `.claude/rules/` or nested files**.

Consequence: the only reliable always-on channel is root CLAUDE.md itself.
Every rule that must fire every session stays there; what moves out is content
that changes no behaviour when unread — evidence, provenance, mechanism depth.
A condensed footgun entry still fires (symptom + remedy are present); its
moved narrative is read only when someone doubts the rule or hits a variant,
which is a prompted read, not a boot-path read.

### File tree (one line per file: what it holds; when it loads)

```
E:\recycle-online\
  CLAUDE.md          rules only, every section; first four sections byte-identical;
                     footguns condensed to symptom+remedy+pointer; boot check kept;
                     workflow/convention rules kept, their incident bodies moved;
                     + a 3-line role router in the preamble.       LOADS EVERY SESSION
  ADVISOR.md         NEW — the advisor's boot file: role bounds, the two unprompted
                     duties, the pre-send checklist (owner pastes the 8 unseen items;
                     placeholder refuses invention until then), not-found-with-these-
                     words, the brief-header conventions.          ON DEMAND + IN PASTE SET
  EVIDENCE.md        NEW — the narrative moved OUT of CLAUDE.md, verbatim, sectioned
                     by the exact rule handle each block backs; supersede-and-date,
                     never rewrite; nothing here is a rule.        ON DEMAND, never pasted
  START_HERE.md      unchanged except §2's advising-chat bullet becomes a pointer to
                     ADVISOR.md (one copy of the advisor's rules, not two).  ON DEMAND (implementer's first read)
  BRIEFING.md        unchanged.                                    ON DEMAND / pasted
  ARCHITECTURE.md    unchanged.                                    ON DEMAND / pasted
  PROJECT_STATUS.md  unchanged.                                    ON DEMAND / pasted
  ROADMAP.md         unchanged.                                    ON DEMAND / pasted
  OPEN_ITEMS.md      unchanged (its § Documentation checklist entry closes when
                     ADVISOR.md lands, superseded with a date).    ON DEMAND / pasted
  RED_TEAM.md        unchanged.                                    ON DEMAND / pasted
  SRS_MAP.md         unchanged, stays excluded from the paste set. ON DEMAND
  lessons/           unchanged: README.md index + one file per lesson.  INDEX ON DEMAND (session-start rule)
  tools/build_paste_set.py   SET_FILES gains one line: ADVISOR.md (9 → 10 files;
                     the declared-count control self-adjusts via len()).  RUN AT BOUNDARIES
  tools/verify_citations.ps1 unchanged; run over ALL citing sources after the move.
  .claude/           unchanged: 4 agents, 2 hooks, 9 skills, settings.json.
```

### What moves, exactly

1. **Machine footguns (446 → ~120 lines).** Each of the 13 entries keeps: its
   bold title **verbatim** (the titles are the citation handles — see
   "Citation integrity" below), the symptom line, the "Instead:" remedy with
   every command in it, and one pointer line `evidence: EVIDENCE.md § <same
   title>`. Everything else — mechanism essays, dated measurements, the
   CRLF-saga forensics, the two-bounds passages — moves to EVIDENCE.md
   verbatim. The entries already carrying `→ lessons/...` pointers keep them.
   Precedent inside the tree: `lessons/opening-a-copy-is-a-write.md` was
   already "moved here from CLAUDE.md's footgun section by that section's own
   test" — content has left this section before without loss.
2. **Boot check (51 → ~38).** All five observables stay. The two incident
   recounts (the twice-caught-defects sentence, the two-days-lost Metro story,
   ~13 lines) move; the observables and the state-the-bundle rule stay.
3. **Workflow (166 → ~100).** Every bullet stays. Moves: the EARNED 2026-08-10
   provisioning story (8 lines), the three dated instances inside "A REPORT IS
   A CLUE" (~40 lines — the rule, the sweep-before-edit order, the
   never/always/first trigger words, and the ninth-item content all STAY),
   the 204-tool-calls story and byte-count forensics inside the skills bullet
   (the OPEN-and-follow rule, both paths, and the byte-count tripwire numbers
   stay), and the WIDENED-2026-08-08 history inside two-homes (~11 lines; the
   test itself and the does-not-move clause stay).
4. **Conventions (48 → ~28).** PIN-A-CLAIM, its corollary, the supersede
   fallback, and keep-a-citation-on-one-line all stay as rules; the measured
   2026-08-11 schema.ts case and the ARCHITECTURE.md:820/:888 evidence move.
5. **Landing size: ~350 ± 20 lines** (69 locked + ~120 footguns + ~38 boot +
   ~100 workflow + ~28 conventions + router/heads). Stated plainly: this does
   NOT reach the official <200 target. Reaching it would require compressing
   the wording of active rules themselves — which the constraints forbid this
   phase from proposing, and which is the owner's call as a separate pass.
   The honest claim is 780 → ~350 with zero active rules removed, cutting the
   always-loaded token weight by roughly 55% (byte-proportional estimate from
   the line counts above; not a token measurement).

### ADVISOR.md — the checklist's home, and the routing that survives forgetting

- Lives at repo root, added to `SET_FILES` in `tools/build_paste_set.py`
  (one tuple; the manifest count control anchors on `len(SET_FILES)` so no
  second number needs editing — verified by reading the script's
  `check_declared_count`). It therefore travels with the nine files already
  dragged into the chat project, and the chat's opening prompt shrinks to a
  pointer at it.
- Content: rows 1–13 of the Task-2 table — the role bounds and the two
  unprompted duties MOVE here from START_HERE.md §2 (which keeps the role list
  and points here; two copies drift, per the project's own rule), the ninth
  item's rule (restated FROM CLAUDE.md by pointer, not by copy), the
  brief-header conventions (currently nowhere), and the pre-send checklist
  section that ships as an explicit placeholder: "eight items live in the
  advising chat's instructions and have not been seen in this tree; the OWNER
  pastes them here; do not invent them" — exactly the OPEN_ITEMS unblock
  condition, which names this as the owner's decision. Landing ADVISOR.md
  without those eight items is still a strict improvement (rows 1–5, 9–13 gain
  a home); with them, the seam closes.
- **The survives-forgetting mechanism is one always-loaded pointer.** CLAUDE.md's
  preamble gains ~3 lines: "Advising session (planning, briefs, no production
  code): your rules are in `ADVISOR.md` — read it before answering anything.
  Implementing session: `START_HERE.md`." Because root CLAUDE.md loads
  unconditionally and re-injects after /compact, a fresh in-terminal advisor
  that was given NO opening prompt still gets routed. This is the only
  channel with that property; nothing else proposed here depends on a file
  being remembered.
- What this does NOT solve, stated: a claude.ai CHAT advisor with nothing
  pasted still has nothing — no repo file can reach it. The paste set remains
  the only bridge for the chat form, which is why ADVISOR.md must be IN the
  set rather than beside it. Whether the chat advisor is retired once the
  terminal advisor exists is the owner's decision; both forms are served
  either way, and the research report §4 confirms no prior art exists to
  borrow instead.

### Citation integrity (the step that makes the move safe)

- **74 occurrences of `CLAUDE.md § ` across 10 files** (Grep, glob `*.md`,
  working tree; 1 is in untracked ARGUS_MOBILE_READ.md, 2 in generated
  lessons/all-lessons.md; 71 in tracked hand-written sources — START_HERE.md
  alone holds 25, OPEN_ITEMS.md 15, ARCHITECTURE.md 14). Every one is a
  `file § Section` "handle" citation; the restructure preserves section names
  and entry-title handles verbatim, so the inbound handles survive without
  touching 10 files.
- After the move, run `tools/verify_citations.ps1` with the call operator and
  array spelling — `& .\tools\verify_citations.ps1 -Source @('START_HERE.md',
  'ARCHITECTURE.md','ROADMAP.md','OPEN_ITEMS.md','PROJECT_STATUS.md',
  'CLAUDE.md','ADVISOR.md','EVIDENCE.md')` — and read `SOURCES=` equals the
  count passed before reading `BROKEN` (the `-Source` footgun's own remedy).
  CLAUDE.md is NOT in the checker's default source list (its Conventions
  section records finding a broken handle only by adding it on purpose), so
  passing it explicitly is part of the phase's Prove:, not an option.
- EVIDENCE.md section names = the footgun/rule titles they back, so the
  condensed entries' pointers are themselves checkable citations.

### Corrections owed to the files being touched (named, not made)

- `CLAUDE.md § Scope and status` "Forward steps are R-numbers, defined in
  ROADMAP.md and nowhere else" is FALSE at HEAD: ROADMAP.md § Numbering closed
  R1–R10 as a log on 2026-08-07 and issues P-numbers. START_HERE.md §1 carries
  the same stale sentence. ROADMAP.md § Corrections owed elsewhere already
  records both. A restructure that re-transcribes either sentence bakes a
  known-false claim into the new layout; the correction needs the owner's
  confirmation (locked section), ideally in the same phase.
- ROADMAP's corrections list is itself one entry stale: it still claims the
  footgun section records lessons/README.md's blob as CRLF 41/41–42/42.
  Measured this pass: CLAUDE.md lines 277–291 at `742ff65` already carry the
  corrected figures (CR=0 in all 45 blobs) and the refutation history. That
  correction is DONE; ROADMAP's pointer to it has rotted.
- D12's two Architecture-section corrections (yard app no longer read-only for
  master data; a fourth program is now a deliverable) are owed to a LOCKED
  section and are out of this restructure's scope — named so the phase brief
  that follows cannot silently absorb them.
- This restructure itself needs a P-number in ROADMAP.md — the numbering that
  the stale sentence would misname.

---

## TASK 4 — what must NOT change

The research report found each of these ahead of, or absent from, the field;
the audit and this pass confirm they exist and work at HEAD. A proposal that
touches any of them has exceeded this brief.

1. **The paste-set tool and its manifest discipline** —
   `tools/build_paste_set.py`: the declared `SET_FILES` list with the
   external-count positive control, byte-hash manifest, dirty-tree annotation,
   BOM/CRLF normalisation on read, the drop-detection on removed files, and
   the `--check` exit vocabulary (0 current / 1 names every stale file / 2
   could-not-run-is-not-a-pass). Research §4: nobody else has tooled the
   paste seam; this is the only bridge the chat advisor has. Adding
   ADVISOR.md is a one-tuple extension, not a mechanism change. Its two
   EXCLUSIONS (all-lessons.md, SRS_MAP.md) keep their recorded reasons.
2. **The citation convention and its checker** — `file § Section` "handle" on
   ONE line, ASCII handles, checked by `tools/verify_citations.ps1` with
   explicit sources. The convention's reason is measured (a small CLAUDE.md
   insert once shifted every line-number pointer non-uniformly — ROADMAP.md
   § Citations); the restructure depends on it working.
3. **The two hooks, including their deliberate asymmetry** —
   `pipe_gate.py` (no check's exit decided by a pipe; applies to EVERY
   principal) and `commit_gate.py` (sub-agents cannot commit; the main
   session deliberately can, because the owner confirms commits). Both files
   document that the asymmetry is intended and must not be "made consistent".
4. **The four agents** — argus / hephaestus / metis / nemesis, each encoding a
   project discipline (cite-or-gap, observe-don't-claim, five-part briefs,
   narrow-input red team). nemesis's input-narrowness (never the brief, never
   the conversation) is the red-team definition in RED_TEAM.md.
5. **The proof discipline** — `Prove:` blocks as observables, run-twice with
   no reseed, the malformed-`Prove:` refusal list in START_HERE.md §3, the
   done-checklist tables in §4, applied ≠ verified, and the two disjoint
   TypeScript programs in the boot check. The audit measured this harness at
   1.2–1.9× the size of the product it proves; it is the project's spine.
6. **The lessons system** — one file per lesson, the one-line index every
   session reads, unprompted authorship at phase close, the two-homes test.
   51 index lines at HEAD (Read of lessons/README.md). EVIDENCE.md must not
   become a second lessons file: lessons are for what forgetting would
   RELEARN; EVIDENCE.md holds provenance for rules that are already stated.
7. **The skills-are-paths rule and its tripwires** — the Workflow entry
   pointing at debug-mantra and buddhist-method by PATH with byte counts. The
   entry survives condensation with its numbers intact; the 204-tool-call
   incident behind it moves to EVIDENCE.md.
8. **The locked sections and the supersede-with-a-date convention** — the
   first four CLAUDE.md sections byte-identical; every stale sentence found
   (R-numbers) is corrected by owner-confirmed supersession, never by silent
   rewrite in the move.
9. **The eight unseen checklist items are not invented.** ADVISOR.md ships
   with the placeholder until the owner pastes them. This is the OPEN_ITEMS
   entry's own unblock condition, and inventing them is the exact failure the
   ninth item exists to prevent.

---

## Named risk the owner should weigh

Moving mechanism prose out of the footgun entries trades depth-at-the-moment-
of-symptom for boot-weight. The mitigation is structural: every condensed
entry keeps enough to ACT (symptom + full remedy commands) and marks itself
condensed with a checkable pointer — the same shape as the skills entry's
"paths, not a summary", which is this repo's own recorded fix for a summary
silently standing in for a body. The residual risk — a session acts on the
condensed remedy where only the full mechanism would have prevented a wrong
diagnosis — is real and cannot be measured in advance; it is the price of the
research-measured alternative, which is a 780-line always-loaded file whose
rules are officially expected to be partially ignored at that length.

## What Phase 2 would prove (so this proposal is checkable, not just plausible)

- `wc -l CLAUDE.md` lands ~350; every removed line exists verbatim in
  EVIDENCE.md (provable by a script diffing moved blocks, or by the paste-set
  hash discipline applied once at the move).
- `& .\tools\verify_citations.ps1 -Source @(...all eight...)` → `SOURCES=8`,
  `BROKEN=0`, exit 0, run bare.
- `build_paste_set.py --check` exits 1 naming exactly the files the phase
  touched; `--write` then lists 10 files; the manifest count control passes.
- Both typecheck programs and the proof suite are untouched by construction
  (no code file moves) — stated as out of scope rather than proven green.

STOP. No file in the repository was edited. The next step is the owner's
review of this proposal and, if accepted, a P-numbered phase brief for the
move itself.
