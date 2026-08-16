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
