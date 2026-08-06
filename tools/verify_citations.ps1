# verify_citations.ps1 - every citation in START_HERE.md must resolve to
# exactly one place.
#
# START_HERE.md cites by section and quoted handle rather than by line
# number, because line numbers move: a three-line insert into CLAUDE.md
# once invalidated all twenty of its pointers at once, and the shift was
# not even uniform. This script proves the replacement actually resolves.
#
# It parses the citations OUT OF START_HERE.md and carries no list of its
# own - a checker holding its own copy of the answer only proves it agrees
# with itself (lessons/a-checker-must-not-share-the-code-it-checks.md).
#
# For each `file <section-mark> Section` "handle" it asserts, in the named
# file:
#   - the section name appears on exactly one heading line
#   - the handle appears on exactly one line
# A citation returning zero is broken; one returning five is not a
# citation. Section-only citations assert the heading alone.
#
# POSITIVE CONTROL, and it is load-bearing. This script's first run from
# its committed home reported CITATIONS=3 instead of 36 and still EXITED 0.
# The section mark had been written as a literal character; Windows
# PowerShell 5.1 reads a BOM-less .ps1 as the ANSI codepage, which is 874
# on this box, so the regex silently stopped matching every citation that
# carries a section and the check reported success over the 3 that remain.
# THIS SOURCE FILE IS THEREFORE ASCII-ONLY - the mark is built from its
# codepoint below - and the run asserts that the number of section-bearing
# citations parsed equals the number present in START_HERE.md. A parser
# that stops seeing them now fails instead of passing quietly.
# (lessons/a-check-that-never-went-red-was-never-observed.md)
#
# Exit 0 = every citation resolves and the control holds. Exit 1 = it does
# not, and each failure is printed BROKEN with its hit count.
#
# Run it BARE, one invocation, no pipe - a pipeline's exit status is the
# last command's (CLAUDE.md, Machine footguns, "hides a non-zero exit"):
#
#   powershell -File tools\verify_citations.ps1

$S    = [char]0x00A7                      # section mark, built from its codepoint
$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'START_HERE.md'
if (-not (Test-Path -LiteralPath $src)) { "START_HERE.md not found at $src"; exit 1 }
$text = (Get-Content -LiteralPath $src -Encoding UTF8) -join "`n"

$bad      = 0
$n        = 0
$sectSeen = 0

# How many citations in the file carry a section? Counted independently of
# the parsers below, from the same correctly-decoded text. Anchored on the
# citation SHAPE - a backtick opening with a filename, then the mark - not
# on "any backticked thing containing the mark", which also swallows the
# syntax example in this file's header and any prose reference like (see
# <mark>2).
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
  $lines = Get-Content -LiteralPath $path -Encoding UTF8

  $sHits = 0; $sLine = ''
  if ($sect) {
    $sectSeen++
    $sh = @($lines | Select-String -SimpleMatch -Pattern $sect | Where-Object { $_.Line -match '^#{1,4} ' })
    $sHits = $sh.Count; $sLine = (($sh | ForEach-Object { $_.LineNumber }) -join ',')
  }
  $hh = @($lines | Select-String -SimpleMatch -Pattern $hand)
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
  $lines = Get-Content -LiteralPath $path -Encoding UTF8
  $sh = @($lines | Select-String -SimpleMatch -Pattern $sect | Where-Object { $_.Line -match '^#{1,4} ' })
  $ok = ($sh.Count -eq 1)
  if (-not $ok) { $bad++ }
  '{0,-3} {1,-7} {2,-18} sect={3,-22} hits={4} L{5} (section-only)' -f `
     $n, $(if($ok){'OK'}else{'BROKEN'}), $file, $sect, $sh.Count, (($sh | ForEach-Object { $_.LineNumber }) -join ',')
}

''
if ($sectSeen -ne $sectExpected) {
  'CONTROL FAILED: START_HERE.md holds {0} sectioned citations, the parser saw {1}.' -f $sectExpected, $sectSeen
  'The parser stopped matching. Do not read the results above as a pass.'
  $bad++
} else {
  'CONTROL OK: {0} sectioned citations present, {1} parsed.' -f $sectExpected, $sectSeen
}
'CITATIONS={0}  BROKEN={1}' -f $n, $bad
if ($bad -gt 0) { exit 1 } else { exit 0 }
