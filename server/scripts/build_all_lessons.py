"""Generate and verify lessons/all-lessons.md.

One script, two modes, ONE generation function:

    --write   build the document and write lessons/all-lessons.md
    --check   build the document into memory, compare against the file on
              disk, exit 1 on any difference

Both modes call build_document(). A checker that regenerates through a second
code path certifies a stale file the moment the two drift; this repo has been
bitten by that shape more than once.

Encoding. Every read is bytes -> .decode("utf-8"); every write is
.encode("utf-8") -> bytes. Nothing here touches the locale default, which is
cp874 on this box and would re-read UTF-8 as mojibake
(lessons/console-is-not-the-observation.md).

Line endings. The document is built with LF and written with LF, in binary, so
the platform never translates. .gitattributes declares `* text=auto eol=lf`,
which beats core.autocrlf=true, so the working tree holds LF today; --check
normalises CRLF and lone CR to LF on both sides anyway, so it stays green if
an editor or a future .gitattributes change reintroduces CRLF.

Exit codes: 0 match / written, 1 mismatch or missing output, 2 build error.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# server/scripts/build_all_lessons.py -> server/scripts -> server -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
LESSONS_DIR = REPO_ROOT / "lessons"

OUTPUT_NAME = "all-lessons.md"
INDEX_NAME = "README.md"

# Amendments are marked only by the heading TEXT -- they sit at ##, the same
# level as ordinary sections, which is exactly why heading levels must not be
# demoted. Both casings occur: `## AMENDED (...)` and `## Amendment (...)`.
# Deliberately does NOT match `### Rider` or `## Footnote`.
AMENDMENT_RE = re.compile(r"^#{2,6}[ \t]+(?:AMENDED|Amendment)\b", re.MULTILINE)

BOM = chr(0xFEFF)  # never write this as a literal: it is invisible in source


class BuildError(Exception):
    """A source file is not shaped the way the generator requires."""


# --------------------------------------------------------------------------
# reading
# --------------------------------------------------------------------------


def normalise_newlines(text: str) -> str:
    """CRLF and lone CR -> LF. Applied to sources and to both sides of --check."""
    return text.replace("\r\n", "\n").replace("\r", "\n")


def read_source(path: Path) -> tuple[str, bool]:
    """Return (LF-normalised text, bom_was_present). UTF-8 pinned explicitly."""
    text = path.read_bytes().decode("utf-8")
    had_bom = text.startswith(BOM)
    if had_bom:
        # A stray U+FEFF mid-document is invisible and corrupting. Strip it and
        # report the count, rather than emitting it or failing the build.
        text = text[len(BOM):]
    return normalise_newlines(text), had_bom


def collect_sources(lessons_dir: Path) -> list[Path]:
    """Lesson files in ASCII filename order. Excludes the index and our output."""
    if not lessons_dir.is_dir():
        raise BuildError(f"lessons directory not found: {lessons_dir}")
    sources = sorted(
        (p for p in lessons_dir.glob("*.md")
         if p.name not in (INDEX_NAME, OUTPUT_NAME)),
        key=lambda p: p.name,
    )
    if not sources:
        raise BuildError(f"no lesson files found in {lessons_dir}")
    return sources


def extract_title(text: str, name: str) -> str:
    """The H1 verbatim, minus the leading '# '. Never summarised or truncated."""
    first_line = text.split("\n", 1)[0]
    if not first_line.startswith("# "):
        raise BuildError(
            f"{name}: line 1 is not an H1 -- expected '# <title>', got {first_line!r}"
        )
    title = first_line[2:].rstrip()
    if not title:
        raise BuildError(f"{name}: line 1 is an empty H1")
    return title


def count_amendments(text: str) -> int:
    return len(AMENDMENT_RE.findall(text))


# --------------------------------------------------------------------------
# generation -- the single source of truth for both modes
# --------------------------------------------------------------------------


def build_document(lessons_dir: Path) -> tuple[str, dict]:
    """Build the whole document as one LF string. Returns (text, stats)."""
    sources = collect_sources(lessons_dir)

    entries = []
    boms_stripped = []
    for path in sources:
        text, had_bom = read_source(path)
        if had_bom:
            boms_stripped.append(path.name)
        entries.append({
            "name": path.name,
            "text": text,
            "title": extract_title(text, path.name),
            "amendments": count_amendments(text),
        })

    amended = [e for e in entries if e["amendments"]]
    total_amendments = sum(e["amendments"] for e in entries)

    chunks: list[str] = []
    chunks.append(_banner(len(entries), total_amendments, len(amended)))
    chunks.append(_toc(entries))
    for entry in entries:
        chunks.append(f"\n---\n\n**SOURCE:** `{entry['name']}`\n\n")
        # Verbatim. Heading levels untouched. Every source ends with a newline;
        # add one if a future file does not, so the next delimiter still starts
        # its own line.
        body = entry["text"]
        chunks.append(body if body.endswith("\n") else body + "\n")

    stats = {
        "entries": entries,
        "lesson_count": len(entries),
        "amended_count": len(amended),
        "total_amendments": total_amendments,
        "boms_stripped": boms_stripped,
        "source_bytes": sum(len(e["text"].encode("utf-8")) for e in entries),
    }
    return "".join(chunks), stats


def _banner(lesson_count: int, total_amendments: int, amended_files: int) -> str:
    return f"""# All lessons (generated)

<!-- GENERATED FILE -- DO NOT HAND-EDIT. Your changes will be overwritten. -->

This file is `lessons/*.md` concatenated. Every edit belongs in the source
lesson file; anything written here is destroyed by the next run.

    regenerate   server/.venv/Scripts/python.exe server/scripts/build_all_lessons.py --write
    check        server/.venv/Scripts/python.exe server/scripts/build_all_lessons.py --check

`--check` rebuilds the document in memory and compares it against this file
byte for byte, with line endings normalised to LF on both sides first. It exits
1 on any difference. That is how a lesson edited without regenerating is caught.

**Sources:** {lesson_count} lesson files, `lessons/*.md`, ASCII filename order.

**Excluded:** `README.md` -- it is the index, not a lesson -- and this file.

**Amendments:** {total_amendments} across {amended_files} files, counted from the source headings and
shown per entry in the table of contents below.

**No date field, deliberately.** No lesson file carries one and it cannot be
recovered from inside them. In this repo a date on a document means "this
decayed, re-run it before citing it" -- and a lesson is not a measurement, so it
does not decay that way. What travels here instead is the source filename and
the amendment count: information already present in the files.

**Heading levels are reproduced unchanged.** Amendment sections sit at `##`, the
same level as ordinary sections, so demoting `#` to `##` would push them to
`###` where they would be indistinguishable from `### Rider` and `### What
actually fixes it`. Entries are separated by a `---` rule and a `**SOURCE:**`
line instead of by heading depth.

"""


def _toc(entries: list[dict]) -> str:
    lines = ["## Table of contents", ""]
    for entry in entries:
        n = entry["amendments"]
        if n == 1:
            marker = " *(1 amendment)*"
        elif n > 1:
            marker = f" *({n} amendments)*"
        else:
            marker = ""
        lines.append(f"- `{entry['name']}`{marker} -- {entry['title']}")
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# modes
# --------------------------------------------------------------------------


def _print_stats(stats: dict, generated: str) -> None:
    print(f"lessons dir      : {LESSONS_DIR}")
    print(f"lesson files     : {stats['lesson_count']}")
    print(f"toc entries      : {stats['lesson_count']}")
    print(f"amendments       : {stats['total_amendments']} "
          f"across {stats['amended_count']} files")
    print(f"source bytes     : {stats['source_bytes']} (LF-normalised, excl README.md)")
    print(f"document bytes   : {len(generated.encode('utf-8'))}")
    print(f"document lines   : {generated.count(chr(10))}")
    if stats["boms_stripped"]:
        print(f"NOTE: BOM stripped from: {', '.join(stats['boms_stripped'])}")


def mode_write(output_path: Path) -> int:
    generated, stats = build_document(LESSONS_DIR)
    # Binary write of UTF-8 bytes: the platform never gets to translate LF.
    output_path.write_bytes(generated.encode("utf-8"))
    _print_stats(stats, generated)
    print(f"WROTE            : {output_path}")
    return 0


def mode_check(output_path: Path) -> int:
    generated, stats = build_document(LESSONS_DIR)
    _print_stats(stats, generated)

    if not output_path.exists():
        print(f"CHECK FAILED     : {output_path} does not exist. Run --write.")
        return 1

    on_disk = normalise_newlines(output_path.read_bytes().decode("utf-8"))
    expected = generated.encode("utf-8")
    actual = on_disk.encode("utf-8")

    if actual == expected:
        print(f"CHECK OK         : {output_path} matches lessons/ "
              f"({len(expected)} bytes, LF-normalised)")
        return 0

    print(f"CHECK FAILED     : {output_path} disagrees with lessons/")
    print(f"  expected bytes : {len(expected)}")
    print(f"  on-disk bytes  : {len(actual)}")
    _report_first_difference(generated, on_disk)
    print("  regenerate with: build_all_lessons.py --write")
    return 1


def _report_first_difference(expected: str, actual: str) -> None:
    """Name the first line that differs, so the failure points somewhere."""
    exp_lines = expected.split("\n")
    act_lines = actual.split("\n")
    for i in range(min(len(exp_lines), len(act_lines))):
        if exp_lines[i] != act_lines[i]:
            print(f"  first differing line: {i + 1}")
            print(f"    expected: {exp_lines[i][:160]!r}")
            print(f"    on disk : {act_lines[i][:160]!r}")
            return
    print(f"  line counts differ: expected {len(exp_lines)}, "
          f"on disk {len(act_lines)}; content matches up to the shorter one")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate or verify lessons/all-lessons.md.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true",
                       help="generate lessons/all-lessons.md")
    group.add_argument("--check", action="store_true",
                       help="compare the generated document against the file on "
                            "disk; exit 1 if they differ")
    args = parser.parse_args(argv)

    output_path = LESSONS_DIR / OUTPUT_NAME
    try:
        return mode_write(output_path) if args.write else mode_check(output_path)
    except BuildError as exc:
        print(f"BUILD ERROR      : {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    # The console here is cp874; the document carries em-dashes and Thai. Pin
    # UTF-8 on our own streams so printing a title never raises, and judge the
    # OUTPUT FILE in bytes, never by what the console renders.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    sys.exit(main())
