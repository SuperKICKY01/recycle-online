# A rule outside the repo cannot be seen to drift

**Found 2026-08-16, during the documentation restructure, at `1d58899`.**

The advising chat's pre-send checklist had lived only in a pasted opening
prompt since its creation. The repository held ONE of its nine items — the
ninth, the negative-claim search rule — and recorded the blindness in its own
words: "that checklist lives in the advising chat's own instructions and NOT
in this repository ... nothing here enforces it, and nothing here can even
see it."

The finding arrived by the one route available: the owner supplied the other
eight items from memory, and instead of writing them in, this session
MEASURED them against the tree. The comparison surfaced what nothing inside
the repo could have: **the two roles had been running different rule-sets for
the project's whole life.**

The specifics, measured at `1d58899`:

- The advisor's checklist and the coder's rules (`CLAUDE.md` Workflow plus
  `START_HERE.md`'s done-checklist) overlapped in only FOUR concepts:
  counting names its tool, every negative carries a control, no
  self-contradiction, no measurement carried as fact.
- The coder's write-the-commit-message-to-a-file rule was never in the
  advisor's set. The advisor's control-on-every-negative was never stated
  generally in `CLAUDE.md` — searched with `control`, `names its tool`,
  `name the tool`, `second, independent`: only instrument-specific remedies
  existed (the count-it-must-meet rule, the second-independent-measurement
  rule, the SOURCES= read), each earned separately, the general rule never
  written once.
- No instrument could have fired. Drift detection needs a second copy to
  disagree with, and the repo held none: the rule was not merely unchecked,
  its drift was INVISIBLE by construction.

What closed it: the four shared checks now live inline in BOTH `CLAUDE.md`
and `ADVISOR.md` — duplication licensed by `tools/verify_shared_checks.py`,
which goes red the moment the copies differ, with `CLAUDE.md` declared
canonical (a third file both roles must open goes measurably unopened, so
the must-run items do not sit behind a pointer). The advisor-only items live
in `ADVISOR.md` and nowhere else, and the checklist travels with the paste
set instead of the prompt.

The rule to keep: treat any rule cited from conversation or memory as a
CLUE, and grep the tree for it before writing it anywhere. Where it is not
found, the finding is not "the rule is missing" — it is "this rule cannot be
seen to drift", which is worse, because a missing rule announces itself the
day it is needed and an unseeable one diverges quietly for the project's
whole life. The trigger to watch for is any rule a role is said to follow
that a grep cannot find.

**AMENDED 2026-08-17 — A SECOND MECHANISM, AND THE QUIETER ONE: THE RULE WAS
DELIVERED IN TWO PARTS AND ONLY ONE PART LOADS.**

The case above is a rule WHOLLY ABSENT from the tree, found by measuring a
from-memory copy against it. This one was neither absent nor drifted. An
auto-memory file for this project path arrives in two pieces: an index line
that loads unconditionally into every session for that path, and a body that
loads only when something opens it. The SCOPE was written in the body and the
INSTRUCTION in the index, so what actually reached every session was "Reply in
Thai, prompts in English" with NO ROLE ATTACHED — and a scope-less instruction
reads as universal.

**No comparison could have found it, which is what makes it a second
mechanism rather than a second instance.** The lesson above is about having no
second copy to disagree with. Here there is one copy, it is correct, and read
whole it says exactly the right thing: the scope sentence is in it. Nothing
had drifted and nothing was missing. The rule arrived with its scope stripped
by the DELIVERY, and the only artefact that could show it is the pair of
what-loads and what-does-not, which no diff and no grep compares.

Measured: this lesson was written 2026-08-16 at `1d58899`, about the advising
checklist. It was reproduced on 2026-08-17 — within ONE DAY, by a different
mechanism, in a file OUTSIDE this repository, where this lesson's own remedy
(grep the tree) cannot reach it.

**THE LIMIT, and it is a different claim from the mechanism.** On 2026-08-17 a
CLI coding session reported to the owner in Thai. Whether it read that index
line is UNCONFIRMED: the competing explanation is that it simply mirrored the
language it was addressed in, and no observation separating the two was taken
before the memory was corrected. The MECHANISM is measured — the index line
did carry an unscoped instruction, and the memory file records its own
correction in its own words. The CAUSATION is not measured. Do not let the
second borrow the first's standing.

The rule to keep: **PUT THE SCOPE IN THE LINE THAT LOADS.** The reader never
sees the line that does not. Wherever a rule is delivered in a part that
always loads and a part that does not, every word the always-loaded part omits
was, for every practical purpose, never written — so the scope belongs beside
the instruction, not underneath it.
