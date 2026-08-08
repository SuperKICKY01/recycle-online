#!/usr/bin/env python
"""PreToolUse gate: a sub-agent may not create a commit in this repository.

WHY THIS EXISTS AS A HOOK AND NOT AS PROSE
------------------------------------------
`.claude/settings.local.json` pre-approves `Bash(git add *)`,
`Bash(git commit *)` and `PowerShell(git *)`. Those grants removed the
permission prompt, which was the one artifact that would physically put a
commit in front of the owner before it existed. CLAUDE.md still says nothing
commits until the owner confirms, so until now that rule was enforced only by
a session choosing to obey it. Hard rule 2 says enforce at the lowest layer
available rather than by remembering. This is that layer.

THE ABSENT KEY, AND WHY MAIN-SESSION COMMITS ARE DELIBERATELY ALLOWED
---------------------------------------------------------------------
`agent_type` is ABSENT from the payload for a main-session tool call. It is
not empty, and it is not null - the key is not there. `payload.get(
"agent_type", "")` would turn that absence into a confident value, and an
allow-list and a deny-list then behave OPPOSITELY on it: a deny-list reads the
default as "not a blocked agent" and lets it through, an allow-list reads it as
"not an approved agent" and blocks it. Both spellings look correct.

So the absence is tested explicitly, once, and the chosen behaviour is stated
rather than fallen into: A MAIN-SESSION `git commit` IS NOT BLOCKED. The owner
drives the main session, and the owner is who this project says confirms a
commit. Gating the owner's own hands would be the gate refusing rather than
selecting, and would make cell (c) of its proof impossible to distinguish from
a gate that blocks everything.

FAIL CLOSED
-----------
Anything this script cannot understand about a shell call from a gated agent
BLOCKS. An observer that cannot parse its input may shrug and exit 0; a gate
that cannot parse its input has no idea what it is waving through. The logging
below is the one exception and is marked as such: it is observability, the
decision never depends on it, and a gate that declined to block because it
could not write a log would be worse than one that blocks silently.
"""

import datetime
import json
import os
import re
import sys

# Roles that may not commit. Names are frontmatter `name:` values, which is
# what `agent_type` reports - not filenames.
GATED_AGENTS = {"hephaestus"}

SHELL_TOOLS = {"Bash", "PowerShell"}

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "gate.log")
LOG_MAX_BYTES = 262144

# Shell separators. A commit hidden behind `&&` or `;` is still a commit.
SEP = re.compile(r"\|\||&&|[;|\n]|\$\(|`")

# git options that consume the NEXT token, so the subcommand is not it.
VALUE_OPTS = {"-c", "-C", "--git-dir", "--work-tree", "--namespace",
              "--exec-path", "--super-prefix"}


def log(line):
    """Best effort. The block/allow decision never depends on this."""
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > LOG_MAX_BYTES:
            os.replace(LOG, LOG + ".1")
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass


def block(reason, detail=""):
    sys.stderr.write(reason + "\n")
    if detail:
        sys.stderr.write(detail + "\n")
    sys.exit(2)


def allow():
    sys.exit(0)


def base_name(tok):
    tok = tok.strip("\"'")
    tok = tok.replace("\\", "/")
    tok = tok.rsplit("/", 1)[-1]
    if tok.lower().endswith(".exe"):
        tok = tok[:-4]
    return tok.lower()


def git_subcommands(cmd):
    """Every git subcommand invoked anywhere in the command string.

    Deliberately biased toward finding one. For a role that must never commit,
    a false positive costs one refusal with an explanation; a false negative
    costs an unreviewed commit in a repository of real money transactions.
    """
    found = []
    for seg in SEP.split(cmd):
        toks = seg.split()
        for i, tok in enumerate(toks):
            if base_name(tok) != "git":
                continue
            j = i + 1
            while j < len(toks) and toks[j].startswith("-"):
                j += 2 if toks[j] in VALUE_OPTS else 1
            if j < len(toks):
                found.append(toks[j].strip("\"'").lower())
    return found


def main():
    try:
        raw = sys.stdin.read()
    except Exception as exc:
        block("commit-gate: could not read the hook payload from stdin (%s)" % exc)

    try:
        payload = json.loads(raw)
    except Exception as exc:
        block("commit-gate: hook payload was not valid JSON (%s)" % exc)

    if not isinstance(payload, dict):
        block("commit-gate: hook payload was not a JSON object")

    tool = payload.get("tool_name")

    # LIVE or TEST, from the payload's own shape rather than a flag a harness
    # must remember. Claude Code sends hook_event_name on every real
    # PreToolUse payload; a hand-built test payload does not. This log is the
    # evidence base for every claim made about this gate, and an evidence base
    # a test can write into indistinguishably is not evidence.
    src = "LIVE" if "hook_event_name" in payload else "TEST"

    # THE ABSENT KEY. Tested for presence, never with a default.
    if "agent_type" not in payload:
        if tool in SHELL_TOOLS:
            ti = payload.get("tool_input")
            cmd = ti.get("command") if isinstance(ti, dict) else None
            if isinstance(cmd, str) and any(
                    s == "commit" or s.startswith("commit-")
                    for s in git_subcommands(cmd)):
                log("%s %s MAIN ALLOW commit-shaped %s :: %s"
                    % (stamp(), src, tool, flat(cmd)))
            else:
                log("%s %s MAIN ALLOW %s :: %s"
                    % (stamp(), src, tool, flat(cmd or "")))
        allow()

    agent = payload.get("agent_type")
    if not isinstance(agent, str):
        block("commit-gate: agent_type was present but not a string; refusing "
              "to guess which role this is")

    if tool not in SHELL_TOOLS:
        allow()

    if agent not in GATED_AGENTS:
        ti = payload.get("tool_input")
        cmd = ti.get("command") if isinstance(ti, dict) else ""
        log("%s %s %s ALLOW (ungated role) %s :: %s"
            % (stamp(), src, agent, tool, flat(cmd)))
        allow()

    ti = payload.get("tool_input")
    if not isinstance(ti, dict):
        block("commit-gate: %s issued a %s call with no tool_input object; "
              "blocking because the gate cannot see what would run"
              % (agent, tool))

    cmd = ti.get("command")
    if not isinstance(cmd, str):
        block("commit-gate: %s issued a %s call with no command string; "
              "blocking because the gate cannot see what would run"
              % (agent, tool))

    subs = git_subcommands(cmd)
    if any(s == "commit" or s.startswith("commit-") for s in subs):
        log("%s %s %s BLOCK %s :: %s" % (stamp(), src, agent, tool, flat(cmd)))
        block(
            "BLOCKED by .claude/hooks/commit_gate.py\n"
            "\n"
            "This role (%s) may not create commits. In this project only the\n"
            "owner confirms a commit - CLAUDE.md, Workflow: \"Do not commit\n"
            "until the owner confirms.\"\n"
            "\n"
            "This is the system working as designed. Do NOT retry it, do NOT\n"
            "reach for the other shell, and do NOT report it as a failure.\n"
            "\n"
            "Instead: leave the work in the working tree, put the DIFF in your\n"
            "report under CHANGED, and stop at the phase boundary. The owner\n"
            "reads the diff and commits." % agent,
            "Command refused: %s" % cmd[:400])

    log("%s %s %s ALLOW %s :: %s" % (stamp(), src, agent, tool, flat(cmd)))
    allow()


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ")


def flat(s):
    """One log entry must be one physical line, or counting the file lies."""
    return str(s).replace("\r", " ").replace("\n", "\\n")[:200]


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # fail closed on anything unforeseen
        sys.stderr.write("commit-gate: internal error, blocking rather than "
                         "guessing (%r)\n" % (exc,))
        sys.exit(2)
