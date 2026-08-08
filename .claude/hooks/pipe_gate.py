#!/usr/bin/env python
"""PreToolUse gate: a check's exit code must not be decided by a pipe.

WHY
---
CLAUDE.md, Machine footguns: "A pipe or `&&` hides a non-zero exit."
`npm run typecheck:app 2>&1 | tail -3 && echo CLEAN` printed CLEAN while tsc
was failing, because a pipeline's status is the LAST command's and tail exits
0. PROJECT_STATUS.md records a prove_auth run discarded for the same reason -
`| tail -6` owned the exit code. It lies in the DANGEROUS direction: it
manufactures a green, which is the one failure nobody goes looking for.

The whole failure lives in the command string, which is exactly what a
PreToolUse hook receives. So this gate is purely syntactic and needs no
knowledge of what the command would have done.

EVERY PRINCIPAL, DELIBERATELY - AND THIS IS THE OPPOSITE OF commit_gate.py
--------------------------------------------------------------------------
commit_gate.py tests `agent_type` for PRESENCE and exempts the main session,
because the owner drives it and the owner is who confirms commits. This gate
does not look at `agent_type` at all. The mistake it catches is one anybody
makes in a hurry, and a gate that exempts the principal most likely to be in a
hurry is not a gate. The asymmetry between the two files is intended; if you
are editing one, do not "make them consistent" without reading both reasons.

WHAT IT CANNOT DISTINGUISH, stated rather than discovered later
---------------------------------------------------------------
Separator detection runs over a MASKED copy of the command with quoted spans,
heredoc bodies and PowerShell here-strings blanked out, so a pipe that is DATA
(`echo "a | b"`) creates no separator and is not blocked.

Check-name detection runs over the ORIGINAL segment, not the masked one. That
is a deliberate bias toward blocking: `python "scripts/prove_x.py" | tail`
still fires, at the cost of a FALSE POSITIVE on a check name that appears only
as quoted data - `grep "pytest" . | head` is refused. Blocking that is an
annoyance; missing the other manufactures a green.

Not handled: `$(...)` and backtick substitution are not parsed, so a check
inside one is judged as if it were at top level (over-blocks, which is the
safe direction). Nothing here understands shell functions, aliases, or a
wrapper script whose NAME does not match a listed check.
"""

import datetime
import os
import json
import re
import sys

# A check whose exit code is the point of running it.
CHECKS = [
    (r"prove_\w*\.py", "a proof script"),
    (r"npm\s+run\s+typecheck", "a typecheck"),
    (r"npm\s+run\s+prove", "a proof runner"),
    (r"verify_citations\.ps1", "the citation checker"),
    (r"\balembic\b", "alembic"),
    (r"\bpytest\b", "pytest"),
    (r"reconcile\.py", "the reconciler"),
    (r"build_all_lessons\.py", "the lessons builder"),
]
CHECKS = [(re.compile(p, re.I), why) for p, why in CHECKS]

SHELL_TOOLS = {"Bash", "PowerShell"}
HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "pipe_gate.log")
LOG_MAX_BYTES = 262144

# Bash: a pipe, an and-chain and an or-chain all take the exit code away.
# PowerShell 5.1: `&&` and `||` are parser errors, so only `|` is real there.
SEP_BASH = re.compile(r"\|\||&&|\|")
SEP_PS = re.compile(r"\|")


def log(line):
    """Best effort. The block/allow decision never depends on this."""
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > LOG_MAX_BYTES:
            os.replace(LOG, LOG + ".1")
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ")


def flat(s):
    """One log entry must be one physical line, or counting the file lies.

    A multi-line command otherwise writes several lines, and every tally taken
    over this log counts continuations as entries.
    """
    return str(s).replace("\r", " ").replace("\n", "\\n")[:200]


def block(text):
    sys.stderr.write(text + "\n")
    sys.exit(2)


def mask(cmd):
    """Same-length copy with quoted spans, heredocs and here-strings blanked."""
    n = len(cmd)
    out = list(cmd)

    # heredoc bodies: everything after the introducing line up to the delimiter
    for m in re.finditer(r"<<-?\s*(['\"]?)([A-Za-z_]\w*)\1", cmd):
        nl = cmd.find("\n", m.end())
        if nl < 0:
            continue
        em = re.search(r"^[ \t]*%s[ \t]*$" % re.escape(m.group(2)),
                       cmd[nl:], re.M)
        end = nl + em.start() if em else n
        for k in range(nl, end):
            if out[k] != "\n":
                out[k] = " "

    s = "".join(out)
    out = list(s)

    # PowerShell here-strings @'...'@ and @"..."@
    for m in re.finditer(r"@(['\"])(?:.|\n)*?\1@", s):
        for k in range(m.start(), m.end()):
            if out[k] != "\n":
                out[k] = " "

    s = "".join(out)
    out = list(s)

    # plain single and double quotes, left to right
    i = 0
    while i < n:
        c = s[i]
        if c in "'\"":
            q = c
            j = i + 1
            while j < n:
                if s[j] == "\\" and q == '"':
                    j += 2
                    continue
                if s[j] == q:
                    break
                j += 1
            for k in range(i, min(j + 1, n)):
                if out[k] != "\n":
                    out[k] = " "
            i = j + 1
        else:
            i += 1
    return "".join(out)


def find_check(segment):
    for rx, why in CHECKS:
        m = rx.search(segment)
        if m:
            return m.group(0), why
    return None


def offences(cmd, tool):
    """Segments that are followed by a separator AND contain a check.

    The LAST segment is never an offence: a pipeline exits with its last
    command's status, so `cat f | pytest` keeps pytest's exit code and is fine.
    """
    sep = SEP_PS if tool == "PowerShell" else SEP_BASH
    masked = mask(cmd)
    hits = list(sep.finditer(masked))
    if not hits:
        return []
    found = []
    start = 0
    for h in hits:
        seg = cmd[start:h.start()]
        c = find_check(seg)
        if c:
            found.append((seg.strip(), h.group(0), c[0], c[1]))
        start = h.end()
    return found


def main():
    try:
        raw = sys.stdin.read()
    except Exception as exc:
        block("pipe-gate: could not read the hook payload from stdin (%s)" % exc)
    try:
        payload = json.loads(raw)
    except Exception as exc:
        block("pipe-gate: hook payload was not valid JSON (%s)" % exc)
    if not isinstance(payload, dict):
        block("pipe-gate: hook payload was not a JSON object")

    tool = payload.get("tool_name")
    if tool not in SHELL_TOOLS:
        sys.exit(0)

    # No agent_type test anywhere in this file. See the module docstring.
    who = payload.get("agent_type") if isinstance(
        payload.get("agent_type"), str) else "MAIN"

    # LIVE or TEST, decided from the payload's own shape rather than from a
    # flag a harness has to remember to set. Claude Code sends hook_event_name
    # on every real PreToolUse payload; a hand-built test payload does not.
    # This log is the evidence base for every claim made about these gates, and
    # an evidence base a test can write into indistinguishably is not evidence.
    # Reconstructing the difference from timestamps afterwards is exactly what
    # this replaces.
    src = "LIVE" if "hook_event_name" in payload else "TEST"

    ti = payload.get("tool_input")
    if not isinstance(ti, dict):
        block("pipe-gate: %s call with no tool_input object; blocking because "
              "the gate cannot see what would run" % tool)
    cmd = ti.get("command")
    if not isinstance(cmd, str):
        block("pipe-gate: %s call with no command string; blocking because "
              "the gate cannot see what would run" % tool)

    bad = offences(cmd, tool)
    if not bad:
        log("%s %s %s ALLOW %s :: %s" % (stamp(), src, who, tool, flat(cmd)))
        sys.exit(0)

    seg, op, name, why = bad[0]
    log("%s %s %s BLOCK %s :: %s" % (stamp(), src, who, tool, flat(cmd)))
    tail = ('; "EXIT=$LASTEXITCODE"' if tool == "PowerShell"
            else '; echo "EXIT=$?"')
    block(
        "BLOCKED by .claude/hooks/pipe_gate.py\n"
        "\n"
        "A check's exit code must not be decided by a pipe or a chain.\n"
        "\n"
        "  the check    : %s\n"
        "  matched      : %s  (%s)\n"
        "  the operator : %s\n"
        "\n"
        "A pipeline's status is the LAST command's. `npm run typecheck:app\n"
        "2>&1 | tail -3 && echo CLEAN` printed CLEAN while tsc was failing,\n"
        "because tail exits 0 - CLAUDE.md, Machine footguns, \"A pipe or `&&`\n"
        "hides a non-zero exit\". It lies in the dangerous direction: it\n"
        "manufactures a green. One prove_auth run has already been discarded\n"
        "here for exactly this.\n"
        "\n"
        "Run it BARE, one command per invocation, and read its own status:\n"
        "\n"
        "  %s %s\n"
        "\n"
        "`;` is a SEQUENCE, not a pipe - it does not touch the preceding\n"
        "command's exit code, and it is the form CLAUDE.md prescribes.\n"
        "Redirection (`> out.txt 2>&1`) is not a pipe either and is fine.\n"
        "If you need to read only the tail, redirect to a file and read the\n"
        "file afterwards.\n"
        "\n"
        "AND KNOW WHAT THIS REFUSAL IS NOT. This gate stops a MANUFACTURED\n"
        "green; it does not produce an OBSERVED one. The command you just\n"
        "issued RAN NOTHING and left no exit code at all. Reading this refusal\n"
        "as \"the check passed, just quietly\" is a WORSE error than the one it\n"
        "prevented: you would be claiming a result from a process that never\n"
        "started. The check is still owed. Run it bare and read its status.\n"
        "\n"
        "This gate applies to EVERY principal, main session included."
        % (seg[:200], name, why, op, seg[:200], tail))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        sys.stderr.write("pipe-gate: internal error, blocking rather than "
                         "guessing (%r)\n" % (exc,))
        sys.exit(2)
