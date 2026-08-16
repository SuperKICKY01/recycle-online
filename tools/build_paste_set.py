"""Assemble the file set the owner pastes into the Claude project, and a
manifest that says whether a pasted set is still current.

    --write   copy the declared set out of the repo and write the manifest
    --check   re-hash the repo and the set against the manifest; exit 1 on drift

THE PROBLEM. The owner keeps a copy of several repo files inside a Claude
project so the advising chat can read them. Copies drift, and a folder that
just holds copies cannot tell anyone that it has. This script does not stop
the drift -- nothing can, short of not copying -- it makes the drift
ANSWERABLE, by recording what was copied, from which commit, and with which
bytes, so a later run can say which files moved and which did not.

WHAT THE SET IS FOR, WHICH DECIDES WHAT IS IN IT. The advising chat reads
these files and NOT the codebase (START_HERE.md, section 2; BRIEFING.md, "Who
this is for"). So the test for inclusion is not "does this change rarely" --
it is "does the advisor give WRONG ADVICE without it". PROJECT_STATUS.md,
OPEN_ITEMS.md and ROADMAP.md move at every phase and are in the set for
exactly that reason: without PROJECT_STATUS.md the advisor answers status
questions with no status, all day, confidently. A file that changes often AND
matters is the strongest case for a manifest, not a case for exclusion. The
set is DECLARED below by the owner, not discovered by a glob: a glob silently
adopts a new root .md nobody chose to paste, and silently drops a renamed one.

EXIT CODES, matching server/scripts/build_all_lessons.py so that two doc tools
in this repo cannot mean different things by the same number:

    0   the set was written / the set matches the repo
    1   the set does NOT match the repo, or the manifest is missing
    2   could not run: a source file is absent, or git failed

ENCODING. Every read is bytes -> .decode("utf-8"); every write is
.encode("utf-8") -> bytes, newline="\\n". Nothing here touches the locale
default, which is cp874 on this box and would re-read UTF-8 as mojibake
(lessons/console-is-not-the-observation.md). Subprocess output is
CRLF-normalised at the point of decode, the way restore_db.py:87 already does
for psql -- a child's stdout arrives CRLF here and an anchored pattern over it
matches nothing (CLAUDE.md, Machine footguns).

A GATE WAS CONSIDERED HERE AND REMOVED. --write used to run
server/scripts/build_all_lessons.py --check first and refuse to bundle unless
it exited 0. It was removed deliberately, and both of its reasons are written
down because a guard deleted without its reasoning gets re-added by the next
person who thinks of it, and a guard KEPT without its reasoning gets bypassed
by the next person who is in a hurry.

  The reason it was adopted, which is DEAD. lessons/all-lessons.md was in the
  set, and the gate stopped a generated file being bundled while it disagreed
  with its own sources. That file was then dropped from the set -- 261K, and
  the advising chat barely opened it -- so there is no generated artifact in
  the set at all, and nothing left for that argument to bite on.

  The reason it was kept for a while, which is TRUE BUT WEAK. lessons/README.md
  IS in the set, and a red --check means lessons/ is mid-edit, so the index
  being copied might describe a corpus the repo has not finished recording. Real,
  but thin: the index is hand-written and can be wrong while the generated file
  is perfectly in sync, so a green gate never proved the index correct. It
  coupled this tool to a second tool's exit code for a signal it could not
  actually deliver -- and a gate whose reason is weak is a gate someone
  eventually bypasses without understanding what they bypassed.

  What replaces it: nothing, on purpose. The manifest records the exact bytes
  and the exact commit each file was copied from, so a lessons/README.md
  copied mid-edit is visible as STALE the moment the edit lands, by the same
  mechanism as every other file. That is the check this tool actually owns.

WHERE THE SET IS WRITTEN, AND WHY IT IS OUTSIDE THE REPO. Default is a sibling
of the repo root, which is E:\\recycle-online-paste-set on this box -- the same
habit backup_db.py has with E:\\recycle-online-backups. Putting 500K of
duplicated docs INSIDE the repo would need a .gitignore entry, and the day
that entry is wrong the repo acquires a second copy of its own status files.
That is the precise disease this project fights (CLAUDE.md, "two copies
drift, and a new session believes whichever it reads first"); a bundling tool
must not be the thing that introduces it.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

# tools/build_paste_set.py -> tools -> repo root
REPO_ROOT = Path(__file__).resolve().parents[1]

DEFAULT_OUT = REPO_ROOT.parent / "recycle-online-paste-set"
OUT_ENV = "RECYCLE_PASTE_SET_DIR"

MANIFEST_JSON = "MANIFEST.json"
MANIFEST_TXT = "MANIFEST.txt"
TOOL = "tools/build_paste_set.py"

BOM = chr(0xFEFF)  # never write this as a literal: it is invisible in source


# --------------------------------------------------------------------------
# THE SET -- declared by the owner. Not a glob. Not inferred.
# --------------------------------------------------------------------------
# (repo path, name inside the set, what that file OWNS)
#
# `lessons/README.md` is the one entry whose name changes. It is flattened,
# because a Claude project holds files by name with no directories, and a bare
# second `README.md` beside the others would be indistinguishable from the
# repo's root README. The mapping is recorded per file in the manifest so the
# rename is checkable rather than remembered.

SET_FILES: list[tuple[str, str, str]] = [
    ("PROJECT_STATUS.md", "PROJECT_STATUS.md",
     "where the work has got to, and the dated observation behind every claim of it"),
    ("OPEN_ITEMS.md", "OPEN_ITEMS.md",
     "the queue: everything outstanding, one line each, unranked"),
    ("ROADMAP.md", "ROADMAP.md",
     "the ORDER of what is not done, and the argument for that order; R-numbers"),
    ("CLAUDE.md", "CLAUDE.md",
     "architecture, the eight hard rules, this box's machine footguns, workflow"),
    ("BRIEFING.md", "BRIEFING.md",
     "the advisor's handoff: the product, the invariants, the shapes of mistake"),
    ("ARCHITECTURE.md", "ARCHITECTURE.md",
     "how the system is assembled, and where each rule is ENFORCED"),
    ("START_HERE.md", "START_HERE.md",
     "reading order, the role split, the phase-brief shape, the done-checklist"),
    ("RED_TEAM.md", "RED_TEAM.md",
     "the definition of a red-team pass, and the three shapes it hunts first"),
    ("ADVISOR.md", "ADVISOR.md",
     "the advising chat's rules: role bounds, unprompted duties, the checklist"),
    ("lessons/README.md", "lessons_README.md",
     "the lesson index: one line per lesson, enough to ask for one by name"),
]


# --------------------------------------------------------------------------
# WHAT IS DELIBERATELY NOT IN THE SET -- reasons travel with the tool, not
# with the conversation that produced it. Printed into MANIFEST.txt so the
# reader of a pasted set sees the boundary of what they were given.
# --------------------------------------------------------------------------

EXCLUDED: list[tuple[str, str]] = [
    ("lessons/all-lessons.md",
     "261K of concatenated lesson bodies, and the advising chat barely opened "
     "it. lessons_README.md carries the 38 titles, which is what the advisor "
     "needs in order to know a lesson EXISTS and ask for it by name. It is "
     "also GENERATED (server/scripts/build_all_lessons.py), so a pasted copy "
     "would be a copy of a derived file -- two generations from the source."),
    ("SRS_MAP.md",
     "it self-declares as a measurement taken at commit ddf3c85 that nothing "
     "recomputes. Hashing it would prove the FILE unchanged while its contents "
     "are already false -- it would certify the wrong property, and certify it "
     "greenly. This tool can detect a file that MOVED; it cannot detect a file "
     "that stood still while the world moved under it, and it must not be read "
     "as if it could."),
    (".claude/agents/ and .claude/skills/",
     "they configure the coding session on this box. The advising chat does not "
     "write production code (START_HERE.md, section 2)."),
    ("server/README.md, server/scripts/BACKUP.md",
     "operational runbooks for a reader sitting at this machine, which the "
     "advisor is not."),
    ("docs/SRS.md",
     "the OWNER is the authority on the requirements, and that file already "
     "records itself as a once-transcribed paste from a chat window. A pasted "
     "copy of it would be a third generation."),
]


class SetError(Exception):
    """The set cannot be built or checked from the current tree."""


# --------------------------------------------------------------------------
# reading and hashing
# --------------------------------------------------------------------------


def normalise_newlines(text: str) -> str:
    """CRLF and lone CR -> LF. Applied to sources and to subprocess output."""
    return text.replace("\r\n", "\n").replace("\r", "\n")


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_for_set(path: Path) -> tuple[bytes, dict]:
    """Repo file -> the exact bytes that go into the set, plus what changed.

    BOM stripped and newlines normalised to LF. lessons/README.md is the one
    file in this repo carrying BOTH a UTF-8 BOM and CRLF, and it is in the set,
    so this is not a hypothetical: without it the pasted index would open with
    an invisible U+FEFF in front of its first heading.

    THE HASH IS OF THE NORMALISED CONTENT, on both sides, which is what makes
    one number enough. The bytes written into the set ARE these bytes, so the
    set copy and the repo source hash identically even though the file on disk
    does not -- and a pure line-ending flip in the working tree does not raise
    a false stale. build_all_lessons.py:240-247 normalises both sides of its
    own comparison for the same reason.
    """
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    had_bom = text.startswith(BOM)
    if had_bom:
        text = text[len(BOM):]
    had_cr = "\r" in text
    content = normalise_newlines(text).encode("utf-8")
    return content, {
        "raw_bytes": len(raw),
        "bom_stripped": had_bom,
        "crlf_normalised": had_cr,
    }


# --------------------------------------------------------------------------
# git -- one command per call, bare, never a pipe or a chain
# --------------------------------------------------------------------------


def git(*args: str) -> str:
    """Run one git command; return its stdout LF-normalised.

    Bare and unchained: a pipeline's status is the last command's, so a chain
    here could hand back a green that git never produced (CLAUDE.md, Machine
    footguns, "A pipe or `&&` hides a non-zero exit").
    """
    try:
        proc = subprocess.run(
            ["git", *args], cwd=str(REPO_ROOT), capture_output=True, check=False,
        )
    except OSError as exc:
        raise SetError(f"could not run git: {exc}") from exc
    if proc.returncode != 0:
        detail = normalise_newlines(proc.stderr.decode("utf-8", "replace")).strip()
        raise SetError(f"git {' '.join(args)} exited {proc.returncode}: {detail}")
    return normalise_newlines(proc.stdout.decode("utf-8", "replace"))


def last_commit_for(rel_path: str) -> dict:
    """The commit that last touched this path. Unit separator, not whitespace,
    so a subject containing spaces cannot be mistaken for another field."""
    out = git("log", "-1", "--format=%H%x1f%cI%x1f%s", "--", rel_path).strip()
    if not out:
        return {"sha": None, "date": None, "subject": None}
    sha, date, subject = out.split("\x1f", 2)
    return {"sha": sha, "date": date, "subject": subject}


def head_commit() -> dict:
    out = git("log", "-1", "--format=%H%x1f%cI%x1f%s").strip()
    sha, date, subject = out.split("\x1f", 2)
    return {"sha": sha, "date": date, "subject": subject}


def working_tree_dirty() -> tuple[bool, list[str]]:
    """Repo-WIDE dirty state. Context only -- it does NOT say the set is dirty."""
    porcelain = git("status", "--porcelain").strip()
    if not porcelain:
        return False, []
    return True, [line.strip() for line in porcelain.split("\n") if line.strip()]


def dirty_set_paths() -> list[str]:
    """Which of the DECLARED set files are uncommitted. A different question.

    Asked of git directly, scoped to the nine paths, rather than by filtering
    the repo-wide list -- porcelain lines carry a two-column status prefix and
    quote unusual paths, so a substring match against them is a guess. Scoping
    the query means git does the matching and the answer is exact.

    The distinction is load-bearing and this tool got it wrong once: it printed
    "uncommitted content is IN this set" while listing an untracked file that
    was nowhere near the set. MANIFEST.txt is read by someone with no repo to
    check it against, so a false claim there is unfalsifiable at the point of
    use -- the worst place in this system to be casually wrong.
    """
    paths = [rel for rel, _, _ in SET_FILES]
    porcelain = git("status", "--porcelain", "--", *paths).strip()
    if not porcelain:
        return []
    return [line.strip() for line in porcelain.split("\n") if line.strip()]


# --------------------------------------------------------------------------
# controls
# --------------------------------------------------------------------------


def check_declared_count(entries: list[dict], claimed_count: int | None) -> list[str]:
    """POSITIVE CONTROL, anchored on this script's own constant.

    Three numbers must agree: the length of SET_FILES declared above, the
    manifest's file_count field, and the number of entries the manifest
    actually lists. Anchoring on SET_FILES is the whole point -- a manifest
    that lost an entry AND had its count field lowered to match is internally
    consistent and still wrong, and only an external number catches it. A
    checker that fails by finding LESS is indistinguishable from one that
    passed (CLAUDE.md, Machine footguns, the .ps1 entry).
    """
    problems = []
    declared = len(SET_FILES)
    if len(entries) != declared:
        problems.append(
            f"COUNT CONTROL: manifest lists {len(entries)} files, "
            f"{TOOL} declares {declared}"
        )
    if claimed_count is not None and claimed_count != declared:
        problems.append(
            f"COUNT CONTROL: manifest file_count says {claimed_count}, "
            f"{TOOL} declares {declared}"
        )
    return problems


# --------------------------------------------------------------------------
# --write
# --------------------------------------------------------------------------


def mode_write(out_dir: Path) -> int:
    started = dt.datetime.now(dt.timezone.utc)
    head = head_commit()
    dirty, dirty_paths = working_tree_dirty()
    dirty_in_set = dirty_set_paths()

    entries: list[dict] = []
    for rel_path, set_name, owns in SET_FILES:
        source = REPO_ROOT / rel_path
        if not source.is_file():
            raise SetError(f"declared set file is missing from the repo: {rel_path}")
        content, facts = read_for_set(source)
        entries.append({
            "repo_path": rel_path,
            "set_name": set_name,
            "owns": owns,
            "bytes": len(content),
            "sha256": sha256_of(content),
            "last_commit": last_commit_for(rel_path),
            **facts,
        })

    problems = check_declared_count(entries, len(entries))
    if problems:
        raise SetError("; ".join(problems))

    out_dir.mkdir(parents=True, exist_ok=True)
    removed = _remove_files_dropped_from_the_set(out_dir, entries)

    for entry, (rel_path, _, _) in zip(entries, SET_FILES):
        content, _ = read_for_set(REPO_ROOT / rel_path)
        (out_dir / entry["set_name"]).write_bytes(content)

    manifest = {
        "tool": TOOL,
        "built_utc": started.isoformat(),
        "repo_root": str(REPO_ROOT),
        "head": head,
        "working_tree_dirty": dirty,
        "dirty_paths": dirty_paths,
        "dirty_set_files": dirty_in_set,
        "declared_file_count": len(SET_FILES),
        "file_count": len(entries),
        "total_bytes": sum(e["bytes"] for e in entries),
        "files": entries,
        "excluded": [{"path": p, "reason": r} for p, r in EXCLUDED],
    }
    (out_dir / MANIFEST_JSON).write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8", newline="\n",
    )
    (out_dir / MANIFEST_TXT).write_text(
        _human_manifest(manifest), encoding="utf-8", newline="\n",
    )

    for entry in entries:
        flags = []
        if entry["bom_stripped"]:
            flags.append("BOM stripped")
        if entry["crlf_normalised"]:
            flags.append("CRLF -> LF")
        note = f"   [{', '.join(flags)}]" if flags else ""
        # An UNTRACKED set file has no last commit: last_commit_for() returns
        # sha None, and None[:7] crashed this loop mid-report once, after the
        # manifest was already written -- a truthful value the printer refused.
        commit_sha = entry["last_commit"]["sha"]
        commit_label = commit_sha[:7] if commit_sha else "uncommitted"
        print(f"  {entry['set_name']:<22} {entry['bytes']:>7} bytes  "
              f"{entry['sha256'][:12]}  {commit_label}{note}")
    for name in removed:
        print(f"  removed (no longer in the set): {name}")

    print(f"files written    : {len(entries)} (declared {len(SET_FILES)})")
    print(f"total bytes      : {manifest['total_bytes']}")
    print(f"head             : {head['sha'][:7]}  {head['date']}")
    print(f"working tree     : {'DIRTY' if dirty else 'clean'}"
          f"{'' if not dirty else f' ({len(dirty_paths)} paths, {len(dirty_in_set)} of them in the set)'}")
    if dirty_in_set:
        print("  NOTE: the set contains UNCOMMITTED content:")
        for path in dirty_in_set:
            print(f"    {path}")
    elif dirty:
        print("  (dirty paths are all outside the set; every file copied is "
              "committed content)")
    print(f"WROTE            : {out_dir}")
    return 0


def _remove_files_dropped_from_the_set(out_dir: Path, entries: list[dict]) -> list[str]:
    """Delete only what a PREVIOUS manifest listed and this set no longer has.

    Narrow on purpose. A file that left the set (all-lessons.md did) would
    otherwise sit in the folder and get pasted forever, but deleting anything
    the tool does not recognise would make a bundling tool into a file
    shredder. Anything unrecognised is reported, never removed.
    """
    previous = out_dir / MANIFEST_JSON
    if not previous.is_file():
        return []
    try:
        old = json.loads(previous.read_bytes().decode("utf-8"))
        old_names = {f["set_name"] for f in old.get("files", [])}
    except (ValueError, KeyError, TypeError):
        return []
    current_names = {e["set_name"] for e in entries}
    removed = []
    for name in sorted(old_names - current_names):
        stale = out_dir / name
        if stale.is_file():
            stale.unlink()
            removed.append(name)
    return removed


# --------------------------------------------------------------------------
# --check
# --------------------------------------------------------------------------


def mode_check(out_dir: Path) -> int:
    manifest_path = out_dir / MANIFEST_JSON
    if not manifest_path.is_file():
        print(f"CHECK FAILED     : no manifest at {manifest_path}. Run --write.")
        return 1
    try:
        manifest = json.loads(manifest_path.read_bytes().decode("utf-8"))
    except ValueError as exc:
        raise SetError(f"{manifest_path} is not readable JSON: {exc}") from exc

    entries = manifest.get("files", [])
    print(f"set              : {out_dir}")
    print(f"built            : {manifest.get('built_utc')}")
    print(f"built from head  : {str(manifest.get('head', {}).get('sha'))[:7]}"
          f"  ({'DIRTY tree' if manifest.get('working_tree_dirty') else 'clean tree'})")
    print(f"repo head now    : {head_commit()['sha'][:7]}")
    print(f"manifest lists   : {len(entries)} files (this tool declares "
          f"{len(SET_FILES)})")

    problems: list[str] = check_declared_count(entries, manifest.get("file_count"))

    declared_paths = {rel for rel, _, _ in SET_FILES}
    listed_paths = {e.get("repo_path") for e in entries}
    for missing in sorted(declared_paths - listed_paths):
        problems.append(f"COUNT CONTROL: {missing} is declared by {TOOL} but "
                        f"absent from the manifest")
    for extra in sorted(listed_paths - declared_paths):
        problems.append(f"COUNT CONTROL: {extra} is in the manifest but no longer "
                        f"declared by {TOOL}")

    stale: list[str] = []
    for entry in entries:
        rel_path = entry["repo_path"]
        set_name = entry["set_name"]
        recorded = entry["sha256"]

        # (1) is the copy in the set still there, and still what we wrote?
        copy_path = out_dir / set_name
        if not copy_path.is_file():
            problems.append(f"MISSING FROM SET : {set_name} "
                            f"(manifest lists it; the file is not in {out_dir})")
        else:
            actual = sha256_of(copy_path.read_bytes())
            if actual != recorded:
                problems.append(
                    f"SET COPY ALTERED : {set_name} was edited after it was "
                    f"written (manifest {recorded[:12]}, on disk {actual[:12]})"
                )

        # (2) has the repo moved underneath the copy?
        source = REPO_ROOT / rel_path
        if not source.is_file():
            stale.append(f"GONE FROM REPO   : {rel_path} no longer exists")
            continue
        content, _ = read_for_set(source)
        if sha256_of(content) != recorded:
            now = last_commit_for(rel_path)
            report = (
                f"STALE            : {rel_path}\n"
                f"    pasted from  : {str(entry['last_commit']['sha'])[:7]}  "
                f"{entry['last_commit']['date']}  {entry['last_commit']['subject']}\n"
                f"    repo now at  : {str(now['sha'])[:7]}  {now['date']}  "
                f"{now['subject']}\n"
                f"    bytes        : set {entry['bytes']} -> repo {len(content)}"
            )
            # THE COMMIT POINTER IS USELESS FOR AN UNCOMMITTED EDIT, AND LOOKS
            # FINE. The content differs but no commit came between, so the two
            # lines above print the SAME sha and read as "nothing has changed"
            # to anyone scanning commits. The byte delta is the only signal in
            # that case. Say it here rather than leave it to be rediscovered
            # from the output -- a reader who trusts the commit lines on a
            # dirty tree concludes the opposite of the truth.
            if entry["last_commit"]["sha"] == now["sha"]:
                report += (
                    "\n    NOTE         : same commit on both lines -- this file is"
                    " edited but UNCOMMITTED,\n"
                    "                   so the commit pointer carries NO information"
                    " here. The byte\n"
                    "                   delta above is the signal."
                )
            stale.append(report)

    if not problems and not stale:
        print(f"CHECK OK         : all {len(entries)} files match the repo "
              f"({manifest.get('total_bytes')} bytes, normalised)")
        return 0

    print("CHECK FAILED     : this set does not match the repo")
    for line in stale:
        print(f"  {line}")
    for line in problems:
        print(f"  {line}")
    # Count FINDINGS, not files: one file can raise two (missing from the set
    # AND stale in the repo), and a count control raises one for no file at all.
    # Labelling findings as files would be this tool miscounting in the one
    # place it exists to count honestly.
    print(f"  findings       : {len(stale) + len(problems)} "
          f"({len(stale)} stale, {len(problems)} set/control)")
    print(f"  files declared : {len(SET_FILES)}")
    print(f"  re-paste the files named above, then: {TOOL} --write")
    return 1


# --------------------------------------------------------------------------
# MANIFEST.txt -- written for a reader who may have no repo at all
# --------------------------------------------------------------------------


def _human_manifest(manifest: dict) -> str:
    head = manifest["head"]
    lines = [
        "Recycle Online - paste set",
        "==========================",
        "",
        "THIS IS A COPY. THE REPOSITORY IS THE SOURCE OF TRUTH.",
        "",
        "If anything in this set disagrees with the repository, the REPOSITORY is",
        "right and this copy is wrong -- including this manifest, and including the",
        "counts and dates written in the files themselves. These files were copied",
        "out of the repo at the moment recorded below, and nothing has kept them up",
        "to date since. A copy cannot know what changed after it was made; that is",
        "not a flaw in this set, it is what a copy is.",
        "",
        "The way to find out is to run, in the repository:",
        "",
        f"    python {TOOL} --check",
        "",
        "    exit 0  this set still matches the repo",
        "    exit 1  it does not -- the output names every file that moved, and",
        "            the commit that moved it. Re-paste only those.",
        "    exit 2  the check could not run at all, which is not a pass.",
        "",
        "If you are a conversation reading these files and you have no access to",
        "the repository, you cannot run that check yourself. Say so when it",
        "matters, and ask for a fresh set rather than assuming this one is current.",
        "",
        "---",
        "",
        f"Built     : {manifest['built_utc']}  (UTC)",
        f"Repo      : {manifest['repo_root']}",
        f"Head      : {head['sha']}",
        f"            {head['date']}  {head['subject']}",
        f"Tree      : {'DIRTY at build time' if manifest['working_tree_dirty'] else 'clean at build time'}",
    ]
    # Two different facts, and conflating them once put a false claim in front
    # of a reader who cannot check it. A dirty repo does not mean a dirty set.
    dirty_in_set = manifest.get("dirty_set_files", [])
    if dirty_in_set:
        lines.append("            UNCOMMITTED content is in this set -- these files were")
        lines.append("            copied with edits that are in no commit:")
        for path in dirty_in_set:
            lines.append(f"              {path}")
    elif manifest["working_tree_dirty"]:
        lines.append(f"            {len(manifest['dirty_paths'])} path(s) were uncommitted, ALL of them")
        lines.append("            outside this set. Every file here is committed content.")
    lines += [
        f"Files     : {manifest['file_count']} "
        f"(this tool declares {manifest['declared_file_count']})",
        f"Size      : {manifest['total_bytes']} bytes, BOM stripped and LF-normalised",
        "",
        "FILES",
        "-----",
    ]
    for entry in manifest["files"]:
        lines.append(f"  {entry['set_name']}")
        lines.append(f"      from        {entry['repo_path']}")
        lines.append(f"      owns        {entry['owns']}")
        lines.append(f"      bytes       {entry['bytes']}")
        lines.append(f"      sha256      {entry['sha256']}")
        lines.append(f"      last commit {str(entry['last_commit']['sha'])[:7]}  "
                     f"{entry['last_commit']['date']}")
        lines.append(f"                  {entry['last_commit']['subject']}")
        notes = []
        if entry["bom_stripped"]:
            notes.append("a UTF-8 BOM was stripped")
        if entry["crlf_normalised"]:
            notes.append("CRLF was normalised to LF")
        if notes:
            lines.append(f"      note        {'; '.join(notes)} -- so this copy is "
                         f"not byte-identical to the repo file")
        lines.append("")

    lines += [
        "WHAT THIS SET DOES NOT CONTAIN",
        "------------------------------",
        "",
        "Stated because the boundary of what you were given is not visible from",
        "inside it. If a question needs one of these, ask for it -- do not answer",
        "from what is here.",
        "",
    ]
    for path, reason in [(e["path"], e["reason"]) for e in manifest["excluded"]]:
        lines.append(f"  {path}")
        for chunk in _wrap(reason, 72):
            lines.append(f"      {chunk}")
        lines.append("")

    lines += [
        "It also contains no code. Every claim in these files about what the code",
        "does is a claim, and the repo is where it is settled.",
        "",
    ]
    return "\n".join(lines)


def _wrap(text: str, width: int) -> list[str]:
    words, out, cur = text.split(), [], ""
    for word in words:
        if cur and len(cur) + 1 + len(word) > width:
            out.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}".strip()
    if cur:
        out.append(cur)
    return out


# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Assemble the Claude-project paste set, or check one is current.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true",
                       help="copy the declared set out of the repo and write the manifest")
    group.add_argument("--check", action="store_true",
                       help="compare the set and the repo against the manifest; "
                            "exit 1 if they differ")
    parser.add_argument("--out", type=Path, default=None,
                        help=f"set directory (default: ${OUT_ENV}, else {DEFAULT_OUT})")
    args = parser.parse_args(argv)

    out_dir = args.out or Path(os.environ.get(OUT_ENV) or DEFAULT_OUT)
    out_dir = out_dir.resolve()

    try:
        return mode_write(out_dir) if args.write else mode_check(out_dir)
    except SetError as exc:
        print(f"REFUSED          : {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    # The console here is cp874 and these documents carry Thai and em-dashes.
    # Pin UTF-8 on our own streams so printing a subject line never raises, and
    # judge the FILES in bytes, never by what the console renders
    # (lessons/console-is-not-the-observation.md).
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    sys.exit(main())
