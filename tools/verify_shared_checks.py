"""verify_shared_checks.py - the four shared checks live inline in BOTH
CLAUDE.md and ADVISOR.md, and this check goes red the moment the two copies
differ.

WHY A DUPLICATE EXISTS AT ALL, in a repository whose standing rule is that two
copies drift. The four shared checks are must-run-every-session items for both
roles. A third file both roles must open is a file that measurably goes
unopened: this repo's own record has a session making 204 tool calls without
opening the two skill files its always-loaded rules pointed at, and the
Vercel evals measured on-demand files skipped 56% of the time. So each role
carries its copy in the file that role already has open by construction --
CLAUDE.md loads unconditionally, ADVISOR.md is the advisor's boot file -- and
THIS CHECK is the licence for the duplication. Remove this check and the
licence dies with it: the two copies become exactly the unchecked duplication
the rule forbids.

ARBITRATION, so a red is a repair instruction and not a debate: CLAUDE.md's
copy is CANONICAL. On any difference, CLAUDE.md wins and ADVISOR.md holds the
stale copy. (Same shape as the store/fake no-divergence rule: the mirror
follows, never leads.)

WHAT IS COMPARED. The text between the `<!-- shared-checks:begin -->` and
`<!-- shared-checks:end -->` markers in each file, byte-for-byte after UTF-8
decode with any BOM consumed and CRLF normalised to LF (a pure line-ending
flip is not content drift -- the same choice build_paste_set.py makes on both
sides of every comparison it does).

CONTROLS, because a parser that can quietly stop matching fails by finding
LESS, which is indistinguishable from a pass (CLAUDE.md, Machine footguns,
the .ps1 entry): each file must contain EXACTLY one marker pair, and each
block must hold EXACTLY four top-level items. A file with zero markers is a
failure, never an empty comparison.

Exit codes, matching build_paste_set.py's vocabulary:
    0   the two copies are identical and every control holds
    1   they differ, or a control failed
    2   could not run (a file is missing / unreadable), which is not a pass

Run it bare, one invocation, and read SHARED_CHECKS_EXIT= -- printed by
__main__ from the same integer handed to sys.exit().
"""

from __future__ import annotations

import difflib
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

# Order is the arbitration: index 0 is canonical, index 1 is the mirror.
CANONICAL = REPO_ROOT / "CLAUDE.md"
MIRROR = REPO_ROOT / "ADVISOR.md"

BEGIN = "<!-- shared-checks:begin -->"
END = "<!-- shared-checks:end -->"
EXPECTED_ITEMS = 4

BOM = chr(0xFEFF)


def block_of(path: Path) -> str | None:
    """The shared-checks block of one file, or None with the failure printed."""
    raw = path.read_bytes().decode("utf-8")
    if raw.startswith(BOM):
        raw = raw[len(BOM):]
    text = raw.replace("\r\n", "\n").replace("\r", "\n")

    begins = text.count(BEGIN)
    ends = text.count(END)
    if begins != 1 or ends != 1:
        print(f"CONTROL FAILED (markers): {path.name} holds {begins} begin / "
              f"{ends} end markers; exactly 1/1 required. A file with no "
              f"block has not been compared.")
        return None

    block = text.split(BEGIN, 1)[1].split(END, 1)[0]
    items = [line for line in block.split("\n") if line.startswith("- ")]
    if len(items) != EXPECTED_ITEMS:
        print(f"CONTROL FAILED (items): {path.name} block holds {len(items)} "
              f"items, {EXPECTED_ITEMS} required.")
        return None
    return block


def main() -> int:
    try:
        canonical = block_of(CANONICAL)
        mirror = block_of(MIRROR)
    except FileNotFoundError as exc:
        print(f"COULD NOT RUN: {exc}")
        return 2
    except OSError as exc:
        print(f"COULD NOT RUN: {exc}")
        return 2

    if canonical is None or mirror is None:
        return 1

    if canonical == mirror:
        print(f"IDENTICAL: {EXPECTED_ITEMS} items, {len(canonical)} chars "
              f"between markers, equal in {CANONICAL.name} and {MIRROR.name}.")
        return 0

    for line in difflib.unified_diff(
        canonical.split("\n"), mirror.split("\n"),
        fromfile=f"{CANONICAL.name} (canonical)",
        tofile=f"{MIRROR.name} (stale on any difference)",
        lineterm="",
    ):
        print(line)
    print(f"DIFFER: {CANONICAL.name} is canonical; {MIRROR.name} holds the "
          f"stale copy. Repair the mirror to match, never the canonical to "
          f"agree.")
    return 1


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    code = main()
    print(f"SHARED_CHECKS_EXIT={code}")
    sys.exit(code)
