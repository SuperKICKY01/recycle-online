# verify_citations.ps1 - every citation in the SOURCE documents must resolve to
# exactly one place.
#
# Sources DEFAULT to START_HERE.md and ARCHITECTURE.md. Pass -Source to narrow or
# extend:
#
#   powershell -File tools\verify_citations.ps1
#   powershell -File tools\verify_citations.ps1 -Source ARCHITECTURE.md
#
# Those documents cite by section and quoted handle rather than by line number,
# because line numbers move: a three-line insert into CLAUDE.md once invalidated
# all twenty of START_HERE.md's pointers at once, and the shift was not even
# uniform. This script proves the replacement actually resolves.
#
# It parses the citations OUT OF each source and carries no list of its own - a
# checker holding its own copy of the answer only proves it agrees with itself
# (lessons/a-checker-must-not-share-the-code-it-checks.md).
#
# For each `file <section-mark> Section` "handle" it asserts, in the named file:
#   - the section name appears on exactly one heading line
#   - the handle appears on exactly one line
# A citation returning zero is broken; one returning five is not a citation.
# Section-only citations assert the heading alone.
#
# WHY -Source EXISTS, AND IT IS THE WHOLE REASON FOR THIS SECOND VERSION.
# The source used to be `Join-Path $root 'START_HERE.md'`, hardcoded, the only
# file this script would ever open. ARCHITECTURE.md was then written carrying 37
# citations in exactly the form checked here, a phase named "this script, bare,
# exit 0" as the observable FOR THOSE CITATIONS, and it exited 0 without ever
# opening the file. The green was truthful and structurally incapable of turning
# red - no edit to ARCHITECTURE.md, however broken, can move a number computed
# from a different document. A checker with the same rules pointed at the right
# file reported 8 broken in the same minute, 7 of them real.
# (lessons/a-check-that-never-went-red-was-never-observed.md, fifth mechanism.)
# So: if you add a document that cites, ADD IT TO $Source. A checker that was
# written before your file existed cannot know about it and will not say so.
#
# TWO POSITIVE CONTROLS, per source, both load-bearing, both printed:
#
#   SECTIONS - the number of section-bearing citations parsed must equal the
#   number present. This script's first run from its committed home reported
#   CITATIONS=3 instead of 36 and still EXITED 0: the section mark had been
#   written as a literal character, and Windows PowerShell 5.1 reads a BOM-less
#   .ps1 as the ANSI codepage, which is 874 on this box, so the regex silently
#   stopped matching every citation carrying a section. THIS SOURCE FILE IS
#   THEREFORE ASCII-ONLY - the mark is built from its codepoint below.
#
#   NON-EMPTY - a source must yield at least one citation. Without it a typo in
#   a filename, an unreadable file, or a parser that stopped matching altogether
#   prints "CITATIONS=0 BROKEN=0" and passes, which is the same failure shape as
#   the paragraph above wearing a different mask.
#
# ENCODING, and both halves were found the hard way. Files are read as bytes ->
# UTF-8 with any BOM consumed, then CRLF and lone CR normalised to LF. Both
# matter for the TARGETS, not just the sources: lessons/README.md is the one file
# in this repo carrying a UTF-8 BOM *and* CRLF, so a plain read leaves U+FEFF
# sitting in front of its "# Lessons" heading, the ^# anchor misses, and a
# perfectly good citation into it reports BROKEN.
#
# Exit 0 = every citation resolves and every control holds. Exit 1 = it does not,
# and each failure is printed BROKEN with its hit count.
#
# Run it BARE, one invocation, no pipe - a pipeline's exit status is the last
# command's (CLAUDE.md, Machine footguns, "hides a non-zero exit"):
#
#   powershell -File tools\verify_citations.ps1

param(
  [string[]]$Source = @('START_HERE.md', 'ARCHITECTURE.md')
)

$S    = [char]0x00A7                      # section mark, built from its codepoint
$root = Split-Path -Parent $PSScriptRoot

# Bytes -> UTF-8 (BOM consumed) -> LF-normalised -> lines. Used for sources AND
# targets; see the ENCODING note in the header.
function Read-DocLines([string]$path) {
  $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 0xFEFF) { $raw = $raw.Substring(1) }
  $raw = $raw -replace "`r`n", "`n"
  $raw = $raw -replace "`r", "`n"
  return ,($raw -split "`n")
}

$targetCache = @{}
function Get-TargetLines([string]$path) {
  if (-not $targetCache.ContainsKey($path)) { $targetCache[$path] = Read-DocLines $path }
  return $targetCache[$path]
}

$grandBad   = 0
$grandCites = 0

foreach ($srcName in $Source) {
  $srcPath = Join-Path $root $srcName
  ''
  "=== SOURCE: $srcName ==="
  if (-not (Test-Path -LiteralPath $srcPath)) {
    "SOURCE MISSING: $srcPath"
    $grandBad++
    continue
  }

  $lines = Read-DocLines $srcPath
  $text  = $lines -join "`n"

  $bad      = 0
  $n        = 0
  $sectSeen = 0

  # How many citations in this file carry a section? Counted independently of the
  # parsers below, from the same correctly-decoded text. Anchored on the citation
  # SHAPE - a backtick opening with a filename, then the mark - not on "any
  # backticked thing containing the mark", which also swallows the syntax example
  # in this file's header and any prose reference like (see <mark>2).
  $sectExpected = ([regex]::Matches($text, '`[A-Za-z0-9_/\.]+\.(?:md|json)\s*' + $S)).Count

  # Pair citations:  `FILE <mark> Section` "handle"
  $pairRx = [regex]('`([A-Za-z0-9_/\.]+\.(?:md|json))(?:\s*' + $S + '\s*([^`]+?))?`\s*"([^"]+)"')
  foreach ($m in $pairRx.Matches($text)) {
    $n++
    $file = $m.Groups[1].Value
    $sect = $m.Groups[2].Value
    $hand = ($m.Groups[3].Value -replace "`n", ' ')
    $path = Join-Path $root $file
    if (-not (Test-Path -LiteralPath $path)) { '{0,-3} BROKEN  missing file {1}' -f $n, $file; $bad++; continue }
    $tlines = Get-TargetLines $path

    $sHits = 0; $sLine = ''
    if ($sect) {
      $sectSeen++
      $sh = @($tlines | Select-String -SimpleMatch -Pattern $sect | Where-Object { $_.Line -match '^#{1,4} ' })
      $sHits = $sh.Count; $sLine = (($sh | ForEach-Object { $_.LineNumber }) -join ',')
    }
    $hh = @($tlines | Select-String -SimpleMatch -Pattern $hand)
    $hHits = $hh.Count; $hLine = (($hh | ForEach-Object { $_.LineNumber }) -join ',')

    $ok = ($hHits -eq 1) -and ((-not $sect) -or ($sHits -eq 1))
    if (-not $ok) { $bad++ }
    '{0,-3} {1,-7} {2,-18} sect={3,-22} hits={4} L{5,-6} handle="{6}" hits={7} L{8}' -f `
       $n, $(if($ok){'OK'}else{'BROKEN'}), $file, $(if($sect){$sect}else{'-'}), $sHits, $sLine, $hand, $hHits, $hLine
  }

  # Section-only citations: `FILE <mark> Section` with no handle after it
  $sectRx = [regex]('`([A-Za-z0-9_/\.]+\.(?:md|json))\s*' + $S + '\s*([^`]+?)`(?!\s*")')
  foreach ($m in $sectRx.Matches($text)) {
    $n++; $sectSeen++
    $file = $m.Groups[1].Value
    $sect = $m.Groups[2].Value
    $path = Join-Path $root $file
    if (-not (Test-Path -LiteralPath $path)) { '{0,-3} BROKEN  missing file {1}' -f $n, $file; $bad++; continue }
    $tlines = Get-TargetLines $path
    $sh = @($tlines | Select-String -SimpleMatch -Pattern $sect | Where-Object { $_.Line -match '^#{1,4} ' })
    $ok = ($sh.Count -eq 1)
    if (-not $ok) { $bad++ }
    '{0,-3} {1,-7} {2,-18} sect={3,-22} hits={4} L{5} (section-only)' -f `
       $n, $(if($ok){'OK'}else{'BROKEN'}), $file, $sect, $sh.Count, (($sh | ForEach-Object { $_.LineNumber }) -join ',')
  }

  ''
  if ($sectSeen -ne $sectExpected) {
    'CONTROL FAILED (sections): {0} holds {1} sectioned citations, the parser saw {2}.' -f $srcName, $sectExpected, $sectSeen
    'The parser stopped matching. Do not read the results above as a pass.'
    $bad++
  } else {
    'CONTROL OK (sections)  : {0} sectioned citations present, {1} parsed.' -f $sectExpected, $sectSeen
  }

  # A source that yields nothing has not been checked, whatever its BROKEN count
  # says. This is the control the hardcoded-source version could not have had.
  if ($n -eq 0) {
    'CONTROL FAILED (non-empty): {0} yielded ZERO citations. It was named as a source and nothing in it was checked.' -f $srcName
    $bad++
  } else {
    'CONTROL OK (non-empty) : {0} citations parsed from {1}.' -f $n, $srcName
  }

  'CITATIONS={0}  BROKEN={1}  ({2})' -f $n, $bad, $srcName
  $grandCites += $n
  $grandBad   += $bad
}

''
'==================================================================='
'SOURCES={0}  CITATIONS={1}  BROKEN={2}' -f $Source.Count, $grandCites, $grandBad
if ($grandBad -gt 0) { exit 1 } else { exit 0 }
